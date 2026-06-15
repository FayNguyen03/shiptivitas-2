import express from 'express';
import Database from 'better-sqlite3';
const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  return res.status(200).send({'message': 'SHIPTIVITY API. Read documentation to see API docs'});
});

// We are keeping one connection alive for the rest of the life application for simplicity
const db = new Database('./clients.db');

// Don't forget to close connection when server gets terminated
const closeDb = () => db.close();
process.on('SIGTERM', closeDb);
process.on('SIGINT', closeDb);

/**
 * Validate id input
 * @param {any} id
 */
const validateId = (id) => {
  if (Number.isNaN(id)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Id can only be integer.',
      },
    };
  }
  const client = db.prepare('select * from clients where id = ? limit 1').get(id);
  if (!client) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid id provided.',
      'long_message': 'Cannot find client with that id.',
      },
    };
  }
  return {
    valid: true,
  };
}

/**
 * Validate priority input
 * @param {any} priority
 */
const validatePriority = (priority) => {
  if (Number.isNaN(priority)) {
    return {
      valid: false,
      messageObj: {
      'message': 'Invalid priority provided.',
      'long_message': 'Priority can only be positive integer.',
      },
    };
  }
  return {
    valid: true,
  }
}

/**
 * Get all of the clients. Optional filter 'status'
 * GET /api/v1/clients?status={status} - list all clients, optional parameter status: 'backlog' | 'in-progress' | 'complete'
 */
app.get('/api/v1/clients', (req, res) => {
  const status = req.query.status;
  if (status) {
    // status can only be either 'backlog' | 'in-progress' | 'complete'
    if (status !== 'backlog' && status !== 'in-progress' && status !== 'complete') {
      return res.status(400).send({
        'message': 'Invalid status provided.',
        'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
      });
    }
    const clients = db.prepare('select * from clients where status = ?').all(status);
    return res.status(200).send(clients);
  }
  const statement = db.prepare('select * from clients');
  const clients = statement.all();
  return res.status(200).send(clients);
});

/**
 * Get a client based on the id provided.
 * GET /api/v1/clients/{client_id} - get client by id
 */
app.get('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  return res.status(200).send(db.prepare('select * from clients where id = ?').get(id));
});

/**
 * Update client information based on the parameters provided.
 * When status is provided, the client status will be changed
 * When priority is provided, the client priority will be changed with the rest of the clients accordingly
 * Note that priority = 1 means it has the highest priority (should be on top of the swimlane).
 * No client on the same status should not have the same priority.
 * This API should return list of clients on success
 *
 * PUT /api/v1/clients/{client_id} - change the status of a client
 *    Data:
 *      status (optional): 'backlog' | 'in-progress' | 'complete',
 *      priority (optional): integer,
 *
 */
//PUT: pass every value in body, not only the adjusted value
app.put('/api/v1/clients/:id', (req, res) => {
  const id = parseInt(req.params.id , 10);
  const { valid, messageObj } = validateId(id);
  if (!valid) {
    res.status(400).send(messageObj);
  }
  let { status, priority } = req.query;
  const statuses = ['backlog', 'in-progress', 'complete'];
  if(status && !statuses.includes(status)){
    return res.status(400).send({
      'message': 'Invalid status provided.',
      'long_message': 'Status can only be one of the following: [backlog | in-progress | complete].',
    });
  }
  priority = parseInt(priority, 10);
  const priorityValidation = validatePriority(priority);
  const priorityValid = priorityValidation.valid;
  const priorityMessageObj = priorityValidation.messageObj;
  if(priority !== undefined && priority !== null && !priorityValid){
    return res.status(400).send(priorityMessageObj);
  }
  let clients = db.prepare('select * from clients').all();
  const client = clients.find(client => client.id === id);
  const currentClientStatus = client["status"];
  if(!status) status = currentClientStatus;
  const currentClientPriority = client["priority"];
  if(!priority) priority = currentClientPriority;
  //CASE 1: same status, different priority
  if(priority && (!status || currentClientStatus === status)){
    if(priority < currentClientPriority) {
      // Moving up in priority: increment clients in range
      db.prepare(`UPDATE clients SET priority = priority + 1 WHERE status = ? AND priority >= ? AND priority < ?`).run(currentClientStatus, priority, currentClientPriority);
    } else if(priority > currentClientPriority) {
      // Moving down in priority: decrement clients in range
      db.prepare(`UPDATE clients SET priority = priority - 1 WHERE status = ? AND priority > ? AND priority <= ?`).run(currentClientStatus, currentClientPriority, priority);
    }
  }
  //CASE 2: different status
  else if(currentClientStatus !== status){
    //incrementing the following client of the new status
    db.prepare(`UPDATE clients SET priority = priority + 1 WHERE status = ? AND priority >= ?`).run(status, priority);
    //decrementing the  client of the current status
    db.prepare(`UPDATE clients SET priority = priority - 1 WHERE status = ? AND priority > ?`).run(currentClientStatus, currentClientPriority);
  }
  /* ---------- Update code below ----------*/
  db.prepare(`UPDATE clients SET status=?, priority=? WHERE id = ?`).run(status, priority, id);
  return res.status(200).send(db.prepare(`SELECT * FROM clients WHERE id = ?`).get(id));
});

app.listen(3001);
console.log('app running on port ', 3001);
