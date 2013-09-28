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
var setup = module.exports.setup = function(callback) {
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
    callback(connection);
  });
};

var deleteUsers = module.exports.deleteUsers = function (callback) {
  onConnect(function (err, connection) {

    r.db(dbConfig.db).table('users')['delete']().run(connection, function(err,result) {
      if(err) {
        logerror("[ERROR][%s][deleteUsers][collect] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      }
      else {
        logdebug("[INFO ][%s][deleteUsers][collect] %s:%s\n%s", result);
        callback(null,result);
      }

    });
  });
};

var deleteGames = module.exports.deleteGames = function (callback) {
  onConnect(function (err, connection) {

    r.db(dbConfig.db).table('games')['delete']().run(connection, function(err,result) {
      if(err) {
        logerror("[ERROR][%s][deleteGames][collect] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      }
      else {
        logdebug("[INFO ][%s][deleteGames][collect] %s:%s\n%s", result);
        callback(null,result);
      }

    });
  });
};

function onConnect(callback) {
  r.connect({host: dbConfig.host, port: dbConfig.port }, function(err, connection) {
    assert.ok(err === null, err);
    connection['_id'] = Math.floor(Math.random()*10001);
    callback(err, connection);
  });
}

setup(function(){

	deleteUsers(function(err,result){
		if(!err) console.log('Successfully deleted',result.deleted,'user records.');
		else console.log(err);
	});

	deleteGames(function(err,result){
		if(!err) console.log('Successfully deleted',result.deleted,'game records.');
		else console.log(err);
	});

});
