(function(){

 	var querystring = function(key,url){
	  url = url || window.location.search;
	  key = key.replace(/[\[]/,"\\\[").replace(/[\]]/,"\\\]"); 
	  var regex = new RegExp("[\\?&]"+key+"=([^&#]*)"); 
	  var results = regex.exec( url );
	  return (!results)?"":decodeURIComponent(results[1].replace(/\+/g, " "));
	};

	var messages = {
		"missinglogin": "Please provide both username and password",
		"bademail": "Sorry, your username and email did not match",
		"badcode":  "Sorry, the username and reset code did not match",
		"badreset": "Sorry, an unknown error occurred, please check your information and try again"
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
	
	//-----------------------------------------
	//Client events	
	var nobubble = function(e) { e.preventDefault&&e.preventDefault(); e.stopPropagation&&e.stopPropagation(); return false;};
	
	var $form = $("#forgotform");
	 
	//Forgot form onsubmit event - validates and submits if OK
	$form.on("submit",function(e) {
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
			}
			
			if(!doSubmit) {
				$(errors).each(function(){ $("#formerrors").show().append("<div>"+this+"</div>"); });
				return nobubble(e);
			}
		}
	});	

	var url = location.href.substr(location.href.indexOf('/forgot/'));
	$form.attr("action",url);

	if (querystring("error")) alertError(querystring("error"));
	if (querystring("message")) alertSuccess(querystring("message"));

})();