(function(){

	var _socket  = io.connect('http://'+document.domain);
	var onehalf = $("script[data-template='half']").html();

 	var querystring = function(key,url){
	  url = url || window.location.search;
	  key = key.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]"); 
	  var regex = new RegExp("[\\?&]"+key+"=([^&#]*)"); 
	  var results = regex.exec( url );
	  return (!results)?"":decodeURIComponent(results[1].replace(/\+/g, " "));
	};

	var messages = {
		"goodlogin": "Welcome back!",
		"createdlogin": "Thanks for joining!  Get ready for some Kriegspiel",
		"badlogin": "Sorry, incorrect username or password",
		"missinglogin": "Please provide both username and password",
		"login": "Sorry, you need to login before you can do that",
		"badid": "Sorry, that gameid was invalid",
		"gameactive": "Sorry, that game is still in play, no peeking!",
		"gamenotfound": "Sorry, that game could not be found"
	}

	//Shows a success banner 
	var alertSuccess = function(message){
		$(".banner").remove();
		var banner = $("<div class='banner success'></div>").text(messages[message]||message);
		$(document.body).append(banner);
	};
	
	//Shows an error banner
	var alertError = function(message){
		$(".banner").remove();
		var banner = $("<div class='banner error'></div>").text(messages[message]||message);
		$(document.body).append(banner);
	};
	
	//Naive jquery render
	$.fn.render = function(template,data) {
		var $target = this;
		var source = $("script[data-template='"+template+"']").html();
		for(var i=0,l=data.length,html,record,rekey;i<l;i++) {
			record = data[i];
			html = source;
			for(var key in record) { 
				if(record.hasOwnProperty(key)) {
					rekey = new RegExp("\{\{"+key+"\}\}","g");
					html  = html.replace(rekey,record[key]);
				}
			}
			$target.append(html.replace(/0\.5/g,onehalf).replace(/\.5/g,onehalf));
		};
		return $target;
	}

	//-----------------------------------------
	//Client events	
	var nobubble = function(e) { e.preventDefault&&e.preventDefault(); e.stopPropagation&&e.stopPropagation(); return false;};
	
	var doStartDialog = function(e) {
		$("#startmodal").show();
		return nobubble(e);
	}
	
	//Checks if a username exists in the database
	var checkUsername = function(callback){
		var username = $("#username").val();
		if (username && username.length>2) {
			$.get("/usernames/"+username).done(function(isExists){
				if(typeof callback === "function") callback.call(this,isExists);
				isExists = isExists.toString();
				$("#newusername").text((isExists==='true')?'(taken)':'(available)');
				$("#newusername").css("color",(isExists==='true')?'red':'green');
				$("#istaken").val(isExists);
			});
		}
	};			
	
	//Toggles if the 'create new account' box is checked
	var newAccount = false;
	var setNewAccount = function(e) {
		if ($("#newaccount > input").is(":checked")) {
			newAccount = true;
			checkUsername();
			$("#newfields").show();
		} else {
			newAccount = false;
			$("#istaken").val('false');
			$("#newusername").text('');
			$("#newfields").hide();
		}
	};
	
	//Checks for keypresses on username to trigger checkUsername
	var usernameTimeout = 0;
	$("#username").on("keyup",function(e) {
		if(newAccount) {
			$("#newusername").text('');
			clearTimeout(usernameTimeout);
			usernameTimeout = setTimeout(checkUsername,500);
		}
	});
	
	//Login form onsubmit event - validates and submits if OK
	$("#loginform").on("submit",function(e) {
		var $login = $(this);
		if(!$login.attr("data-override")) {
			$("#formerrors").html('').hide();
			var doSubmit=true;
			var errors = [];
			var username=$("#username").val();
			var password=$("#password1").val();
			var password2=$("#password2").val();
			var istaken=$("#istaken").val()==='true'?true:false;
			if (!username.length) {
				errors.push('Username is missing');
				doSubmit = false;
			} else if (!password.length) {
				errors.push('Password is missing');
				doSubmit = false;
			} else if (newAccount && !password2.length) {
				errors.push('Retyped Password is missing');
				doSubmit = false;
			} else if (newAccount && password!==password2) {
				errors.push('Passwords do not match');
				doSubmit = false;
			} else if (newAccount && istaken) {
				errors.push('Sorry! that username is not available');
				doSubmit=false;
			}
			
			if(!doSubmit) {
				$(errors).each(function(){ $("#formerrors").show().append("<div>"+this+"</div>"); });
				e.stopPropagation();
				e.preventDefault();
				return false;
			}
		}
	});	

	var loadGames = function() {

		$("#lists").show();

		$.get("/games?state=inactive",function(data,status){
			if(status==="success" && data) {
				$("#inactive").render("inactive",data);
			}		
		});
	
		$.get("/games?state=active",function(data,status){
			if(status==="success" && data) {
				$("#active").render("active",data);
			}		
		});
	
		$.get("/games?state=finished",function(data,status){
			if(status==="success" && data) {
				$("#finished").render("finished",data);
			}		
		});

	};

	var setVariant = function() {
		var variant = querystring("type")||"lovenheim";
		$("#type").text(variant);
		$("input[name=variant]").each(function(){
			var radio = $(this);
			if (radio.val()===variant) {
				radio.attr("checked","checked"); 
			} else {
				radio.removeAttr("checked");
			} 
		});
	};
	
	var onJoinAdd = function(data) {
		$("#inactive").render("inactive",[data]);
	};

	var onJoinRemove = function(data) {
		$("#inactive").find("li[data-gameid='"+data.gameid+"']").remove();
	};

	//-----------------------------------------
	// AJAXY stuff
	
	//Checks for an existing session, and toggles the login box/session info respectively
	$.get("/session",function(data,status){
		if(status==="success" && data && data.username) {
			$("#sessionusername").text(data.username);			
			$("#session").show();
			$("#login").hide();
			loadGames();
		} else {
			$("#session").hide();
			$("#login").show();
		}
	},"json");

	if (querystring("error")) alertError(querystring("error"));
	if (querystring("message")) alertSuccess(querystring("message"));

	//Wireup Events
	$("#startgame").on("click",doStartDialog);
	$("#newaccount").on("click",setNewAccount);

	setVariant();
	setNewAccount();

	_socket.on('joinadd', onJoinAdd);
	_socket.on('joinremove', onJoinRemove);
	
})();