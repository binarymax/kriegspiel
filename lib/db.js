// A fork of the [node.js chat app](https://github.com/eiriksm/chat-test-2k) 
// by [@orkj](https://twitter.com/orkj) using socket.io, rethinkdb, passport and bcrypt on an express app.
//
// See the [GitHub README](https://github.com/rethinkdb/rethinkdb-example-nodejs-chat/blob/master/README.md)
// for details of the complete stack, installation, and running the app.

var r = require('rethinkdb')
  , util = require('util')
  , assert = require('assert')
  , secrets = require('../secrets')
  , logdebug = require('debug')('rdb:debug')
  , logerror = require('debug')('rdb:error');


// #### Connection details

// RethinkDB database settings. Defaults can be overridden using environment variables.
var dbConfig = {
  host: secrets.dbhost || 'localhost',
  port: secrets.dbport || 28015,
  auth: secrets.dbauth,
  db  : 'kriegspiel',
  tables: {
    'users': 'username',
    'games': 'gameid'
  }
};

var dbConnect = {host: dbConfig.host, port: dbConfig.port};
if (dbConfig.auth) dbConnect.authKey = dbConfig.auth; 

/**
 * Connect to RethinkDB instance and perform a basic database setup:
 *
 * - create the `RDB_DB` database (defaults to `kriegspiel`)
 * - create tables `games`, `users` in this database
 */
module.exports.setup = function() {
  r.connect(dbConnect, function (err, connection) {
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

module.exports.findUsersByFilter = function (filter, map, callback) {
  onConnect(function (err, connection) {
  	var command = (!filter || filter == {}) ? r.db(dbConfig['db']).table('users') : r.db(dbConfig['db']).table('users').filter(filter); 
    command.pluck('username','rating','played','won','lost','drawn','wonpct','lostpct','drawnpct','rated','joined','rwon','rlost','rdrawn','rwonpct','rlostpct','rdrawnpct').orderBy(r.desc('rated')).run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][findUsersByFilter] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
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


module.exports.saveUser = function (user, callback) {  
  onConnect(function (err, connection) {
  	var command = (user.userid)?r.db(dbConfig.db).table('users').get(user.userid).update(user):r.db(dbConfig.db).table('users').insert(user);
    command.run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][saveUser] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      } else {
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

module.exports.savePassword = function (userid, hashword, callback) {  
  onConnect(function (err, connection) {
  	var command = r.db(dbConfig.db).table('users').get(userid).update({hashword:hashword,forgot:""});
    command.run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][saveUser] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      } else {
        if (result.inserted === 1) {
          callback(null, true, result.generated_keys[0]);
        } else if (result.replaced > 0) {
          callback(null, true, true);
        } else {
          callback(null, true);
        }
      }
      connection.close();
    });
  });
};

module.exports.saveForgotCode = function (userid, code, callback) {  
  onConnect(function (err, connection) {
  	console.log(code);
  	var command = r.db(dbConfig.db).table('users').get(userid).update({forgot:code});
    command.run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][saveUser] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      } else {
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

module.exports.findGamesByFilter = function (filter, map, callback) {
  onConnect(function (err, connection) {
    r.db(dbConfig['db']).table('games').filter(filter).pluck('gameid','state','blackusername','whiteusername','moves','result','rated','turn','startdate','enddate').orderBy(r.desc('enddate')).run(connection, function(err, result) {
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

module.exports.findGamesByPlayer = function (username, map, callback) {
  onConnect(function (err, connection) {
    r.db(dbConfig['db']).table('games').filter(function(game){ return (game('whiteusername').eq(username).or(game('blackusername').eq(username))); }).pluck('gameid','state','blackusername','whiteusername','moves','result','rated','turn','startdate','enddate').run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][findGamesByPlayer] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
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

module.exports.findGamesByPlayerAndState = function (username, state, map, callback) {
  onConnect(function (err, connection) {
    r.db(dbConfig['db']).table('games').filter(function(game){ return game('state').eq(state).and(game('rated').eq(true).and(game('whiteusername').eq(username).or(game('blackusername').eq(username)))); }).pluck('gameid','state','blackusername','whiteusername','moves','result','rated','turn','startdate','enddate').orderBy(r.desc('enddate')).run(connection, function(err, result) {
      if(err) {
        logerror("[ERROR][%s][findGamesByPlayer] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
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
  r.connect(dbConnect, function(err, connection) {
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

//Indexes:
/*
r.db('kriegspiel').table('users').indexCreate('username')
r.db('kriegspiel').table('games').indexCreate('gameid')
r.db('kriegspiel').table('games').indexCreate('whiteusername')
r.db('kriegspiel').table('games').indexCreate('blackusername')
r.db('kriegspiel').table('games').indexCreate('state')
r.db('kriegspiel').table('games').indexCreate('rated')
r.db('kriegspiel').table('games').indexCreate('playername', function(game) {
    return [game('whiteusername'), game('blackusername')];
});
*/