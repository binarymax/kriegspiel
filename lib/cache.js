var redis = require('redis')
  , client = redis.createClient()
  , logerror = require('debug')('cache:error');

var Cache = module.exports = {};

var prefix = "kriegspiel:cache:";

var set = Cache.set = function(key,value,callback){
	var data = {epoch:Date.now(),data:value};
	if(typeof callback === "function") {
		client.set(prefix+key, JSON.stringify(data),callback);
	} else {
		client.set(prefix+key, JSON.stringify(data));
	}
};

var get = Cache.get = function(key,expires,callback){
	client.get(prefix+key,function(err,reply) {
		if(err) {
	        logerror("[ERROR][%s][cache:get] %s:%s\n%s", key, err.name, err.msg, err.message);
	        callback(err);
		} else {
			var data = JSON.parse(reply);
			var time = Date.now();
			if(!data || !data.epoch) {
				callback(null,null);
			} else if ((expires === -1) || (time-epoch < expires)) {
				callback(null,data.cache);
			} else {
				callback(null,null);
			}
		}
	});
};

var expire = Cache.expire = function(key,callback){
	if(typeof callback === "function") {
		client.set(prefix+key, '{}',callback);
	} else {
		client.set(prefix+key, '{}');
	}	
};

var add = Cache.add = function(key,data,callback) {
	if (typeof callback === 'function') {
		client.lpush(prefix+key,JSON.stringify(data),callback);
	} else {
		client.lpush(prefix+key,JSON.stringify(data));
	}
};

var range = Cache.range = function(key,head,size,callback) {
	client.lrange(prefix+key,head,head+size,function(err,reply){
		if(err) {
	        logerror("[ERROR][%s][cache:range] %s:%s\n%s", key, err.name, err.msg, err.message);
	        callback(err);
		} else {
			callback(null,reply.map(JSON.parse));
		}
	});
};