var db = require('./db')
  , bcrypt = require('bcrypt')
  , secrets = require('../secrets');

var Security = module.exports = {};

//Login a user, create the user if necessary
var loginOrCreateUser = Security.loginOrCreateUser = function(req,res) {

	var newaccount=req.body.newaccount;
	var username=req.body.username;
	var password1=req.body.password1;
	if (newaccount==='on') {
		//New account setup
		addUser(req,res,function(err,isValid){
			if (!err && isValid) {
				console.log('[ INFO ] New user created!',username);
				res.redirect('/join?message=createdlogin');
			} else {
				console.log('[ ERROR ]',err);
				res.redirect('/join?error=missinginfo');
			}
		});
	} else if (username && password1) {
		//login
		loginUser(req,res,function(isValid){
			if(isValid) {
				res.redirect('/join?message=goodlogin');
			} else {
				setTimeout(function(){res.redirect('/join?error=badlogin');},150);
			}
		});
	} else {
		//Missing username or password
		res.redirect('/join/?error=missinglogin');
		return false;
	}
}

//Middleware user authentication
var authenticateUser = Security.authenticateUser = function(req,res,next) {
	if(req.session && req.session.username) {
		next();
		return true;
	} else {
		res.redirect('/join?error=login');
		return false;
	}
};

var existingUser = Security.existingUser = function(username,callback){
	db.findUserByUsername(username,function(err,row) {
		if(row && row.username && row.username === username) {
			callback(true);
		} else {
			callback(false);
		}
	});	
};

//Add a new user to the database and create session
var addUser = Security.addUser = function(req,res,callback) {
	//New account setup
	var username=req.body.username;
	var password1=req.body.password1;
	var password2=req.body.password2;
	var email=req.body.email||'';
	if (!username||!password1||!password2) { res.redirect('/join/?error=missinginfo'); return false; }
	if (password1!==password2) { res.redirect('/join/?error=passwordmismatch'); return false; }
	existingUser(username,function(isExists){

		if(isExists) {
			//User already exists!  Bail out
			callback('User already exists',false);
			return;
		} 
		
		//Encrypt password:
		bcrypt.genSalt(10,function(err,salt) {
			bcrypt.hash(password1, salt, function(err, hashword) {		
				//Save the user:
				db.saveUser({username:username,hashword:hashword,email:email},function(err,isValid,id) {
					if(isValid) {
						req.session.userid = id;
						req.session.username = username;
						req.session.email = email;
						req.session.loginepoch = Date.now();
						req.session.save();	
					} else {
						req.session.userid = null;
						req.session.username = null;
						req.session.email = null;
						req.session.loginepoch = -1;
						req.session.save();
					}
					callback(err,isValid);
				});
			});
		});
	});
	return true;
};

var loginUser = Security.loginUser = function(req,res,callback) {
	var username = req.body.username;
	var password = req.body.password1
	login(username,password,function(isValid,record){
		if(isValid && record) {
			req.session.userid = record.id;
			req.session.username = record.username;
			req.session.email = record.email;
			req.session.loginepoch = Date.now();
			req.session.save();	
		} else {
			req.session.userid = null;
			req.session.username = null;
			req.session.email = null;
			req.session.loginepoch = -1;
			req.session.save();
		}
		callback(isValid);
	});
};

var login = function(username,password,callback) {
	db.findUserByUsername(username,function(err,row){
		if(err || !row || (row && !row.hashword)) {
			callback(false);
		} else if (row && row.hashword) {
			bcrypt.compare(password, row.hashword, function(err, success) {callback(!err && success , row);});
		} else {
			callback(false);
		}
	});
};