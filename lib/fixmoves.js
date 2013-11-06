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

var saveGame = function (game, callback) {  
  onConnect(function (err, connection) {
  	var command = r.db(dbConfig.db).table('games').get(game.gid).update(game);
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

var fixMoves = module.exports.deleteUsers = function (callback) {
  onConnect(function (err, connection) {

    r.db(dbConfig.db).table('games').orderBy('gameid').run(connection, function(err,cursor) {
      if(err) {
        logerror("[ERROR][%s][deleteUsers][collect] %s:%s\n%s", connection['_id'], err.name, err.msg, err.message);
        callback(err);
      }
      else {
        logdebug("[INFO ][%s][deleteUsers][collect] %s:%s\n%s", cursor);
        cursor.toArray(function(err,result){ 
        	for(var i=0,l=result.length;i<l;i++) {
	        	result[i].moves = result[i].history.length/2;
	        	saveGame(result[i],function(x,y,z){console.log(x,y,z);});
	        	//console.log(result[i].moves); }
	        }
        });
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

	fixMoves(function(err,result){
		if(!err) console.log('Successfully deleted',result.deleted,'game records.');
		else console.log(err);
	});

});
