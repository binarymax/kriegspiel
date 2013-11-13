var kriegspiel = window.kriegspiel;
	kriegspiel = kriegspiel||{};
if(!kriegspiel.lobby) {
	kriegspiel.lobby = (function(){
	
		var _online = [];	
	
		var _socket  = io.connect('http://'+document.domain);
		var _tooltip = $('<div class="tooltip"></div>');

		var _username = null;

		//var _tipOnline  = "<div><em><strong>This Spieler is Online!</strong></em><br><span class='challenge'>Challenge!</span></div>";
		var _tipOnline  = "<div><em><strong>This Spieler is Online!</strong></em></div>";
		var _tipOffline = "<div><em><strong>This Spieler is Offline</strong></em></div>";

		//A Spieler joined the lobby
		var onLobbyAdd = function(data) {
			$(".spieler[data-spieler='"+data.username+"']").addClass("online");
			for(var i=0,f=-1,l=_online.length;i<l;i++) {
				if (_online[i]===data.username) {
					f=i;
					break;
				}
			}
			if (f===-1) _online.push(data.username)
		}
		
		//A Spieler left the lobby
		var onLobbyRemove = function(data) {
			$(".spieler[data-spieler='"+data.username+"']").removeClass("online");
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
		
		var doChallengeSpieler = function(e) {
			var challenged = $(this).parents(".spieler:first").attr("data-spieler");
			var data = {challenger:_username,challenged:challenged};
			_socket.emit("challenge",data);			
		}

		//Mouseover spieler elements, show tooltip
		var doHoverEnter = function(e) {
			var spieler = $(this);
			var offset = $(this).offset(), top, left;
			if (offset && (top=offset.top) && (left=offset.left)) {
				var content = $(this).hasClass("online") ? _tipOnline : _tipOffline;
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
				
		var check = function(element){
			element.find(".spieler").each(function(){
				var spieler = $(this);
				var username = spieler.attr("data-spieler");
				for(var i=0,f=-1,l=_online.length;i<l;i++) {
					if (_online[i] === username) {
						spieler.addClass("online")
						break;
					} 
				}
				if (f===-1) spieler.removeClass("online");
			});
		}		
		
		var init = function(){
			
			$.get("/online",function(data,status){
				if(status==="success" && data) {
					_online = data.online;
					$(".spieler").removeClass("online");
					for(var i=0,l=data.online.length;i<l;i++) {
						onLobbyAdd({username:data.online[i]});
					}
				}
			});

			$("body")
				.on("mouseenter",".spieler",doHoverEnter)
				.on("mouseleave",".spieler",doHoverLeave)
				.on("click",".spieler .challenge",doChallengeSpieler)			
			
		}		

		//Checks for an existing session, and toggles the login box/session info respectively
		$.get("/session",function(data,status){
			if(status==="success" && data && data.username) {
				_username = data.username
			}
		},"json");
	
		_socket.on('lobbyadd', onLobbyAdd);
		_socket.on('lobbyremove', onLobbyRemove);
		_socket.on('lobbychallenge', onLobbyChallenge);
		_socket.on('lobbychallengeaccept', onLobbyChallengeAccepted);
		_socket.on('lobbychallengedecline', onLobbyChallengeDeclined);

		return {
			init:init,
			check:check
		}
	
	})();
}