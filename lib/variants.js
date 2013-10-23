var fs = require('fs')
  , path = require('path');

var Variants = module.exports = {};

var common = {
	"declinedraw": "{{username}} has declined the draw offer",
	"acceptdraw": "{{username}} has accepted the draw offer",
	"offerdraw": "{{isactive}} has offered a draw",
	"impossible": "{{isactive}} has attempted an impossible move",
	"enpassant": "{{isactive}} has captured on {{square}}, en passant!",
	"inactive": "You cannot move until your opponent has joined!",
	"finished": "The game has already ended!",
	"welcome": "{{username}} has joined as {{color}}",
	"resigned": "{{isactive}} has resigned",
	"gameover": "{{inactive}} is in {{gameover}}",
	"promoted": "{{username}} has promoted!",
	"illegal": "{{isactive}} has attempted an illegal move",
	"capture": "{{isactive}} has captured on {{square}}",
	"finish": "The game is over, and the result is {{score}}",
	"check": "{{inactive}} is in check",
	"move": "{{isactive}} has moved"
}

var template = Variants.template = function(variant){
	var target = Variants[variant].__data__;
	return function(name,data) {
		var message = target.messages[name];
		for(var key in data) {
			if(data.hasOwnProperty(key)) {
				message = message.replace("{{"+key+"}}",data[key]);
			}	
		}
		return message;
	}
};

var templates = Variants.templates = function(variant){
	var target = Variants[variant].__data__;
	return function() {
		return target.messages;
	}
};

var hasrule = Variants.hasrule = function(variant){
	var target = Variants[variant].__data__;
	return function(rule) {
		return target.rules[rule]?true:false;
	}
};

var rules = Variants.rules = function(variant){
	var target = Variants[variant].__data__;
	return function(rule) {
		return target.rules;
	}
};


var load = Variants.load = function() {
	var revar = /\w+\.js$/i;
	var files = fs.readdirSync("./lib/variants");
	var file,name,variant;
	for(var i=0,l=files.length;i<l;i++) {
		file = files[i];
		if (revar.test(file)) {
			name = file.substr(0,file.indexOf(".js"));
			variant = require('./variants/'+name);
			for(var message in common) {
				//Load common messages
				if(common.hasOwnProperty(message) && !variant.messages.hasOwnProperty(message)) {
					variant.messages[message] = common[message];
				}
			}
			Variants[name] = {__data__:variant};
			Variants[name].rule = hasrule(name);
			Variants[name].rules = rules(name);	
			Variants[name].message = template(name);
			Variants[name].messages = templates(name);
		}
	}
	//Chain after load:
	return Variants;
};