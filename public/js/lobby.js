var kriegspiel = window.kriegspiel;
	kriegspiel = kriegspiel||{};
if(!kriegspiel.lobby) {
	kriegspiel.lobby = (function(){
	
		var _online = [];	
	
		var _socket  = io.connect('http://'+document.domain);
		var _tooltip = $('<div class="tooltip"></div>');

		var _username = null;

		var _tipOnline  = "<div><em><strong>This Spieler is Online!</strong></em><br><div class='challenge inline'>Challenge!</div><div class='chat inline'>Chat</div></div>";
		var _tipOnlineI = "<div><em><strong>This Spieler is Online!</strong></em></div>";
		var _tipOffline = "<div><em><strong>This Spieler is Offline</strong></em></div>";

		var tmplonline = 
			'<script type="text/template" data-type="template" data-template="online">' +
			'<li class="online" data-spieler="{{spieler}}">{{spieler}}</li>' + 	
			'</script>';

		var tmplchatbox = 
			'<script type="text/template" data-type="template" data-template="chatbox">' +
			'<li class="chatbox" data-spieler="{{spieler}}"><h3 class="chattitle">{{spieler}}</h3><div class="chatbody"><ul class="chatlist"></ul>' + 
			'<form class="chatform"><input type="text" name="chat" class="chattext"></form></div></li>' + 
			'</script>';
			
		var tmplchatmessage = 
			'<script type="text/template" data-type="template" data-template="chatmessage">' +
			'<li class="chatmessage">{{text}}</li>' + 	
			'</script>';


		//A Spieler joined the lobby
		var onLobbyAdd = function(data) {
			$(".spieler[data-spieler='"+data.username+"']").addClass("online");
			for(var i=0,f=-1,l=_online.length;i<l;i++) {
				if (_online[i]===data.username) {
					f=i;
					break;
				}
			}
			if (f===-1) {
				_online.push(data.username);
				$("#online").render("online",{spieler:data.username});
			}
		}
		
		//A Spieler left the lobby
		var onLobbyRemove = function(data) {
			$(".spieler[data-spieler='"+data.username+"']").removeClass("online");
			$("#online > .spieler[data-spieler='"+data.username+"']").remove();
			for(var i=0,l=_online.length;i<l;i++) {
				if (_online[i]===data.username) {
					_online.splice(i,1);
					break;
				}
			}
		}

		//A Spieler hath challenged thee!
		var onLobbyChallengeAccepted = function(data) {
			if (data.challenged && data.challenger===_username) {
				alert('accepted!');
			}
		}

		//A Spieler hath challenged thee!
		var onLobbyChallengeDeclined = function(data) {
			if (data.challenged && data.challenger===_username) {
				alert('declined!');
			}
		}

		//A Spieler hath challenged thee!
		var onLobbyChallenge = function(data) {
			if (data.challenger && data.challenged===_username) {
				var message = data.challenger + " has challenged you to a game of kriegspiel!  Do you accept the challenge?";
				if (window.confirm(message)) {
					_socket.emit("acceptchallenge",data);
					//location.href=url;
				} else {
					_socket.emit("declinechallenge",data);
				}
			}
		}
		
		//Gets a Chatbox UI
		var getChatbox = function(spieler){
			var selector = "#chats > .chatbox[data-spieler='"+spieler+"'] > .chatbody > .chatlist";
			var chatbox = $(selector);
			if(!chatbox.length) {
				$("#chats").render("chatbox",{spieler:spieler});
				chatbox = $(selector);
			}
			return chatbox;
		}
		
		//Chat message Received
		var onLobbyChat = function(data){
			var spieler;
			if (_username === data.to) spieler = data.from; 
			if (_username === data.from) spieler = data.to;
			var chatbox = getChatbox(spieler);
			data.text = data.text||'';
			chatbox.render("chatmessage",data);
		}

		//-----------------------------------------
		// Client side events


		//Challenge a spieler to a match
		var doChallengeSpieler = function(e) {
			var challenged = $(this).parents(".spieler:first").attr("data-spieler");
			var data = {challenger:_username,challenged:challenged};
			_socket.emit("challenge",data);			
		}

		//Mouseover spieler elements, show tooltip
		var doHoverEnter = function(e) {
			var spieler = $(this);
			var player = spieler.attr("data-spieler");
			var offset = $(this).offset(), top, left;
			if (offset && (top=offset.top) && (left=offset.left)) {
				var content = $(this).hasClass("online") ? (player===_username?_tipOnlineI:_tipOnline) : _tipOffline;
				var height  = $(this).innerHeight();
				var width   = $(this).innerWidth();
				top  = top  + height + 'px';
				left = left + 'px';
				spieler.append(_tooltip.show().css({top:top,left:left}).html(content));
			}
			e.stopPropagation();
			e.preventDefault();
			return false;
		};
							
		//Mouseout spieler elements, remove tooltip
		var doHoverLeave = function(e) {
			$(this).find(".tooltip").remove();
			e.stopPropagation();
			e.preventDefault();
			return false;
		};
		
		var doChatSpieler = function(e) {
			var spieler = $(this).parents(".spieler:first").attr("data-spieler");
			if (spieler !== _username) onLobbyChat({from:_username,to:spieler}); 
			e.stopPropagation();
			e.preventDefault();
			return false;
		};
		
		var doChatSubmit = function(e) {
			var chatbox  = $(this).parents(".chatbox:first");
			var chattext = $(this).find(".chattext");
			var spieler  = chatbox.attr("data-spieler");
			var message  = chattext.val();
			_socket.emit('lobbychat',{from:_username,to:spieler,text:message});
			chattext.val('');
			e.stopPropagation();
			e.preventDefault();
			return false;
		}
		
		
		//---------------------------------------------
		// Client API
		
				
		//Check online status for all players
		var check = function(element){
			element.find(".spieler").each(function(){
				var spieler = $(this);
				var username = spieler.attr("data-spieler");
				for(var i=0,f=-1,l=_online.length;i<l;i++) {
					if (_online[i] === username) {
						spieler.addClass("online");
						break;
					} 
				}
				if (f===-1) spieler.removeClass("online");
			});
		}		
		
		var init = function(room){

			//Checks for an existing session, and toggles the login box/session info respectively
			$.get("/session",function(data,status){
				if(status==="success" && data && data.username) {
					_username = data.username

					_socket.on('lobbyadd', onLobbyAdd);
					_socket.on('lobbychat', onLobbyChat);
					_socket.on('lobbyremove', onLobbyRemove);
					_socket.on('lobbychallenge', onLobbyChallenge);
					_socket.on('lobbychallengeaccept', onLobbyChallengeAccepted);
					_socket.on('lobbychallengedecline', onLobbyChallengeDeclined);		
		
					$("body")
						.on("mouseenter",".spieler",doHoverEnter)
						.on("mouseleave",".spieler",doHoverLeave)
						.on("click",".spieler .chat",doChatSpieler)
						.on("click",".spieler .challenge",doChallengeSpieler)
						.append(tmplonline)	
						.append(tmplchatbox)
						.append(tmplchatmessage)		
						.append("<div id='lobby'><ul id='online'></ul><ul id='chats'></ul></div>")
						
					$("#lobby").on("submit",".chatform",doChatSubmit);		
					
					$.get("/online",function(data,status){
						if(status==="success" && data) {
							_online = data.online;
							$(".spieler").removeClass("online");
							for(var i=0,l=_online.length;i<l;i++) {
								$("#online").render("online",{spieler:_online[i]});
								onLobbyAdd({username:_online[i]});
							}
						}
					});
								
					_socket.emit('lobbyjoin',{room:room});

				}

			},"json");
					
		}
		
		return {
			init:init,
			check:check
		}
	
	})();
}