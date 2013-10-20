/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*
* Postal games.
*
*******************************************/

var email = require('emailjs')
  , secrets = require('../secrets');
 
var Postal = module.exports = {};
 
Postal.send = function(args,callback) {
	// Assumes all the validations for the email address formats are correct

	var headers	= {
		text		: args.text,
		from		: '"Kriegspiel" <donotreply@krgspl.com>',
		to			: args.to.join(','),
		subject		: args.subject
	};

	// Create message
	var message = email.message.create(headers);

	// If an HTML email
	if(args.html) message.attach_alternative(args.html);

	// send the message and get a callback with an error or details of the message that was sent
	var server  = email.server.connect({
			user		: "donotreply@krgspl.com",
			password	: secrets.email,
			host		: "binarymax.easycgi.com",
			port		: 587,
			tls			: true
	});

	// send the message and get a callback with an error or details of the message that was sent
	server.send(message, callback);
}

Postal.forgot = function(to,link,callback) {

	var body = 'To reset your krgspl.com password, please visit the following link: '+link;
	Postal.send({to:[to],subject:'Reset your krgspl.com Password',text:body},callback);

}

/*
var jade   = require('jade')
  , fs     = require('fs')
  , model  = require('./lib/model')
  , email  = require('./lib/mail')
  , render = jade.compile(fs.readFileSync('./views/emails/savethedate.jade'),{pretty:true});
  
var sendList = function() {
	model.Reply.list(function(err,info){
		if(!err && info && info.length) {
			var rec,i,l=info.length;
			for(i=0;i<l;i++) {
				rec = info[i];
				sendEmail(rec);
			}
		}
	});
}

var sendEmail = function(data) {
	if(data.Email.indexOf('@')>-1) {
		setTimeout(function(){
			var html = render(data);
			var headers	= {
				html		: html,
				from		: '"Max and Christine" <rsvp@maxandchristine.com>',
				to			: [data.Email],
				subject		: "Save the date!"
			};
	
			email.send(headers,function(resp){
				if(resp && resp.isSuccess) {
					model.Reply.updateEmailsSent(data.Shortcode,function(err,info){
						console.log('Email successfully sent to',data.Name);
					});
				}
			});
	
		},100);
	}
}
*/