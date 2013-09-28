// A fork of the [node.js chat app](https://github.com/eiriksm/chat-test-2k) 
// by [@orkj](https://twitter.com/orkj) using socket.io, rethinkdb, passport and bcrypt on an express app.
//
// See the [GitHub README](https://github.com/rethinkdb/rethinkdb-example-nodejs-chat/blob/master/README.md)
// for details of the complete stack, installation, and running the app.

var r = require('rethinkdb')
  , util = require('util')
  , assert = require('assert')
  , logdebug = require('debug')('rdb:debug')
  , logerror = require('debug')('rdb:error');


// #### Connection details

// RethinkDB database settings. Defaults can be overridden using environment variables.
var dbConfig = {
  host: process.env.RDB_HOST || 'localhost',
  port: parseInt(process.env.RDB_PORT) || 28015,
  db  : process.env.RDB_DB || 'kriegspiel',
  tables: {
    'users': 'username',
    'games': 'gameid'
  }
};

/**
 * Connect to RethinkDB instance and perform a basic database setup:
 *
 * - create the `RDB_DB` database (defaults to `chat`)
 * - create tables `messages`, `cache`, `users` in this database
 */
module.exports.setup = function() {
  r.connect({host: dbConfig.host, port: dbConfig.port }, function (err, connection) {
    assert.ok(err === null, err);
    r.dbCreate(dbConfig.db).run(connection, function(err, result) {
      if(err) {
        logdebug("[DEBUG] RethinkDB database '%s' already exists (%s:%s)\n%s", dbConfig.db, err.name, err.msg, err.message);
      }
      else {
        logdebug("[INFO ] RethinkDB database '%s' created", dbConfig.db);
      }

      for(var tbl in dbConfig.tables) {
        (function (tableName) {
          r.db(dbConfig.db).tableCreate(tableName, {primaryKey: dbConfig.tables[tbl]}).run(connection, function(err, result) {
            if(err) {
              logdebug("[DEBUG] RethinkDB table '%s' already exists (%s:%s)\n%s", tableName, err.name, err.msg, err.message);
            }
            else {
              logdebug("[INFO ] RethinkDB table '%s' created", tableName);
            }
          });
        })(tbl);
      }
    });
  });
};

// #### Filtering results

/**
 * Find a user by email using the 
 * [`filter`](http://www.rethinkdb.com/api/#js:selecting_data-filter) function. 
 * We are using the simple form of `filter` accepting an object as an argument which
 * is used to perform the matching (in this case the attribute `mail` must be equal to
 * the value provided). 
 *
 * We only need one result back so we use [`limit`](http://www.rethinkdb.com/api/#js:transformations-limit)
 * to return it (if found). Results are [`collect`](http://www.rethinkdb.com/api/#js:accessing_rql-collect)ed
 * and passed as an array to the callback function. 
 *
 * @param {String} mail
 *    the email of the user that we search for
 *
 * @param {Function} callback
 *    callback invoked after collecting all the results 
 * 
 * @returns {Object} the user if found, `null` otherwise 
 */
module.exports.findUserByEmail = function (mail, callback) {
  onConnect(function (err, connection) {
    logdebug("[INFO ][%s][findUserByEmail] Login {user: %s, pwd: 'you really thought I'd log it?'}", connection['_id'], mail);

    r.db(dbConfig.db).table('users').filter({'mail': mail}).limit(1).run(connection, function(err, cursor) {
      if(err) {
        logerror("[ERROR][%s][findUserByEmail][collect] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      }
      else {
        cursor.next(function (err, row) {
          if(err) {
            logerror("[ERROR][%s][findUserByEmail][collect] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
            callback(err);
          }
          else {
            callback(null, row);
          }
          connection.close();
        });
      }

    });
  });
};

/**
 * Find a user by username using the 
 * [`filter`](http://www.rethinkdb.com/api/#js:selecting_data-filter) function. 
 * We are using the simple form of `filter` accepting an object as an argument which
 * is used to perform the matching (in this case the attribute `mail` must be equal to
 * the value provided). 
 *
 * We only need one result back so we use [`limit`](http://www.rethinkdb.com/api/#js:transformations-limit)
 * to return it (if found). Results are [`collect`](http://www.rethinkdb.com/api/#js:accessing_rql-collect)ed
 * and passed as an array to the callback function. 
 *
 * @param {String} username
 *    the username of the user that we search for
 *
 * @param {Function} callback
 *    callback invoked after collecting all the results 
 * 
 * @returns {Object} the user if found, `null` otherwise 
 */
module.exports.findUserByUsername = function (username, callback) {
  onConnect(function (err, connection) {
    logdebug("[INFO ][%s][findUserByUsername] Login {user: %s, pwd: 'you really thought I'd log it?'}", connection['_id'], username);

    r.db(dbConfig.db).table('users').filter({'username': username}).limit(1).run(connection, function(err, cursor) {
      if(err) {
        logerror("[ERROR][%s][findUserByUsername][collect] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      }
      else {
        cursor.next(function (err, row) {
          if(err) {
            logerror("[ERROR][%s][findUserByUsername][collect] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
            callback(err);
          }
          else {
            callback(null, row);
          }
          connection.close();
        });
      }

    });
  });
};


/**
 * Every user document is assigned a unique id when created. Retrieving
 * a document by its id can be done using the
 * [`get`](http://www.rethinkdb.com/api/#js:selecting_data-get) function.
 *
 * RethinkDB will use the primary key index to fetch the result.
 *
 * @param {String} userId 
 *    The ID of the user to be retrieved.
 *
 * @param {Function} callback
 *    callback invoked after collecting all the results 
 * 
 * @returns {Object} the user if found, `null` otherwise
 */
module.exports.findUserById = function (userId, callback) {
  onConnect(function (err, connection) {
    r.db(dbConfig['db']).table('users').get(userId).run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][findUserById] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(null, null);
      }
      else {
        callback(null, result);
      }
      connection.close();
    });    
  });
};

/**
 * Adding a new user to database using  [`insert`](http://www.rethinkdb.com/api/#js:writing_data-insert).
 *
 * If the document to be saved doesn't have an `id` field, RethinkDB automatically
 * generates an unique `id`. This is returned in the result object.
 *
 * @param {Object} user
 *   The user JSON object to be saved.
 *
 * @param {Function} callback
 *    callback invoked once after the first result returned
 *
 * @returns {Boolean} `true` if the user was created, `false` otherwise
 */
module.exports.saveUser = function (user, callback) {  
  onConnect(function (err, connection) {
    r.db(dbConfig.db).table('users').insert(user).run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][saveUser] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      }
      else {
        if (result.inserted === 1) {
          callback(null, true, result.generated_keys[0]);
        }
        else {
          callback(null, false);
        }
      }
      connection.close();
    });
  });
};


/**
 * Every user document is assigned a unique id when created. Retrieving
 * a document by its id can be done using the
 * [`get`](http://www.rethinkdb.com/api/#js:selecting_data-get) function.
 *
 * RethinkDB will use the primary key index to fetch the result.
 *
 * @param {String} userId 
 *    The ID of the user to be retrieved.
 *
 * @param {Function} callback
 *    callback invoked after collecting all the results 
 * 
 * @returns {Object} the user if found, `null` otherwise
 */
module.exports.findGameById = function (gameid, callback) {
  onConnect(function (err, connection) {
    r.db(dbConfig['db']).table('games').filter(r.row('gameid').eq(gameid)).run(connection, function(err, cursor) {
      if(err) {
        logerror("[ERROR][%s][findGameById] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(null, null);
      }
      else {
      	cursor.toArray(function(err,result){ callback(null, result&&result[0]); })
      }
      connection.close();
    });
  });
};

/**
 * Adding a new user to database using  [`insert`](http://www.rethinkdb.com/api/#js:writing_data-insert).
 *
 * If the document to be saved doesn't have an `id` field, RethinkDB automatically
 * generates an unique `id`. This is returned in the result object.
 *
 * @param {Object} user
 *   The user JSON object to be saved.
 *
 * @param {Function} callback
 *    callback invoked once after the first result returned
 *
 * @returns {Boolean} `true` if the user was created, `false` otherwise
 */
 
module.exports.saveGame = function (game, callback) {  
  onConnect(function (err, connection) {
  	var command = (game.gid)?r.db(dbConfig.db).table('games').get(game.gid).update(game):r.db(dbConfig.db).table('games').insert(game);
    command.run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][saveUser] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      }
      else {
        if (result.inserted === 1) {
          callback(null, true, result.generated_keys[0]);
        } else if (result.replaced > 0) {
          callback(null, true, true);
        } else {
          callback(null, false);
        }
      }
      connection.close();
    });
  });
};

/**
 * Every user document is assigned a unique id when created. Retrieving
 * a document by its id can be done using the
 * [`get`](http://www.rethinkdb.com/api/#js:selecting_data-get) function.
 *
 * RethinkDB will use the primary key index to fetch the result.
 *
 * @param {String} userId 
 *    The ID of the user to be retrieved.
 *
 * @param {Function} callback
 *    callback invoked after collecting all the results 
 * 
 * @returns {Object} the user if found, `null` otherwise
 */
module.exports.findGamesByFilter = function (filter, map, callback) {
  onConnect(function (err, connection) {
    r.db(dbConfig['db']).table('games').filter(filter).run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][findGamesByFilter] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(null, null);
      }
      else {
      	var recs = [];
      	result.each(function(err,rec){
      		recs.push(map(rec));
      	});
        callback(null, recs);
      }
      connection.close();
    });
  });
};



// #### Helper functions

/**
 * A wrapper function for the RethinkDB API `r.connect`
 * to keep the configuration details in a single function
 * and fail fast in case of a connection error.
 */ 
function onConnect(callback) {
  r.connect({host: dbConfig.host, port: dbConfig.port }, function(err, connection) {
    assert.ok(err === null, err);
    connection['_id'] = Math.floor(Math.random()*10001);
    callback(err, connection);
  });
}

// #### Connection management
//
// This application uses a new connection for each query needed to serve
// a user request. In case generating the response would require multiple
// queries, the same connection should be used for all queries.
//
// Example:
//
//     onConnect(function (err, connection)) {
//         if(err) { return callback(err); }
//
//         query1.run(connection, callback);
//         query2.run(connection, callback);
//     }
//