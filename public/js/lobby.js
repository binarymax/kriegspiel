/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*
* Lobby Chat Room
*
*******************************************/
var kriegspiel = window.kriegspiel;
	kriegspiel = kriegspiel||{};
if(!kriegspiel.lobby) {
	kriegspiel.lobby = (function(){
	
		var _socket   = window._socket;
		if(!_socket) _socket = window._socket = io.connect('http://'+document.domain);
	
		var _online = [];		
		var _username = null;

		//Naive jquery render
		$.fn.render = function(template,data,map) {
			var $target = this;
			var source = $("script[data-template='"+template+"']").html().replace(/^\s*/,'').replace(/\s*$/,'');
			data = (data instanceof Array) ? data:[data]; 
			for(var i=0,l=data.length,html,record,rekey;i<l;i++) {
				record = data[i];
				if (typeof map !== 'function' || map(record)) {  
					html = source;
					for(var key in record) { 
						if(record.hasOwnProperty(key)) {
							rekey = new RegExp("\{\{"+key+"\}\}","g");
							html  = html.replace(rekey,record[key]);
						}
					}
					$target.append(html.replace(/0\.5/g,'½').replace(/\.5/g,'½'));
				}
			};
			return $target;
		}

		//Scroll the to the bottom
		var scrollId = 0;
		var scroller = function() {
			var $list = $("#panel > *");
			var $panel = $("#panel");
			clearTimeout(scrollId);
			scrollId = setTimeout(function(){
				//Scroll to the bottom
				var top = 0;
				$list.each(function(){top+=$(this).outerHeight(true);});
				$panel.finish().animate({scrollTop:top},500);
			},100);		
		}


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
				if(data.username!==_username) $("#online").render("lobbyonline",data);
				scroller();
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
				setTimeout(function(){location.href=data.url;},50);
			}
		}

		//A Spieler hath challenged thee!
		var onLobbyChallengeDeclined = function(data) {
			if (data.challenged && data.challenger===_username) {
				alert(data.challenged + ' has respectfully declined your challenge.');
			}
		}

		//A Spieler hath challenged thee!
		var onLobbyChallenge = function(data) {
			if (data.challenger && data.challenged===_username) {
				var message = data.challenger + " has challenged you to a game of kriegspiel!  Do you accept the challenge?";
				if (window.confirm(message)) {
					_socket.emit("acceptchallenge",data);
					location.href=data.url;
				} else {
					_socket.emit("declinechallenge",data);
				}
			}
		}

		//Gets a Chatbox UI
		var getChatbox = function(spieler){
			var selector = "#lobby > #panel > .chatbox[data-spieler='"+spieler+"']";
			var chatbox = $(selector);
			if(!chatbox.length) {
				$("#panel").render("lobbychatbox",{spieler:spieler});
				chatbox = $(selector);
			}
			chatbox.show();
			doLobbyDisplay(null,true);
			return chatbox;
		}
		
		//Gets a Chatbox UI Message List
		var getChatlist = function(spieler){
			return getChatbox(spieler).find(".chatbody > .chatlist");
		}
		
		//Gets a Chatbox UI Message List
		var getChattext = function(spieler){
			return getChatbox(spieler).find(".chattext");
		}

		//Fixes long text to wrap with hyphens		
		var fixText = function(text) {
			var reWord = /\s/;
			var maxlen = 25;
			var words = text.split(reWord);
			for(var i=0,l=words.length,word,repl;i<l;i++) {
				word = '';
				repl = words[i];
				if(repl.length>maxlen) {
					while (repl.length>maxlen) {
						word += repl.substr(0,maxlen) + '- ';
						repl  = repl.substr(maxlen);
					}
					text = text.replace(words[i],word+repl);
				}
			}
			return text;
		}

		//Chat message Received
		var onLobbyChat = function(data){
			var spieler;
			if (_username === data.to) { spieler = data.from; data.msgclass="to"; } 
			if (_username === data.from) { spieler = data.to; data.msgclass="from"; }
			var chatlist = getChatlist(spieler);
			if (data.text && !chatlist.find(".chatmessage[data-sent='"+data.sent+"']").length) {
				data.text = fixText(data.text);
				chatlist.render("lobbychatmessage",data);
			}
			scroller();
			getChattext(spieler).focus();
		}

		//Chat message Received
		var onLobbyChats = function(data){
			for(var i=data.length-1;i>-1;i--) {
				onLobbyChat(data[i]);
			}
		}

		//-----------------------------------------
		// Client side events


		var nobubble = function(e) { e&&e.preventDefault&&e.preventDefault(); e&&e.stopPropagation&&e.stopPropagation(); return false;};

		//Challenge a spieler to a match
		var doChallengeSpieler = function(e) {
			var challenged = $(this).parents(".spieler:first").attr("data-spieler");
			var data = {challenger:_username,challenged:challenged};
			_socket.emit("challenge",data);	
		}

		//Mouseover spieler elements, show tooltip
		var doHoverEnter = function(e) {
			if ($(this).parents("#lobby").length) return;
			var spieler = $(this);
			var player = spieler.attr("data-spieler");
			var offset = $(this).offset(), top, left;
			if (offset && (top=offset.top) && (left=offset.left)) {
				var content = $(this).hasClass("online") ? (player===_username?"tooltipself":"tooltiponline") : "tooltipoffline";
				var height  = $(this).innerHeight();
				var width   = $(this).innerWidth();
				top  = top  + height + 'px';
				left = left + 'px';
				spieler.render(content).find('.tooltip').css({top:top,left:left}).show();
			}
			return nobubble(e);
		};
							
		//Mouseout spieler elements, remove tooltip
		var doHoverLeave = function(e) {
			if ($(this).parents("#lobby").length) return;
			$(this).find(".tooltip").remove();
			return nobubble(e);
		};
		
		var doChatSpieler = function(e) {
			var spieler = $(this).parents(".spieler:first").attr("data-spieler");
			var data    = {from:_username,to:spieler};
			if (spieler !== _username) {
				onLobbyChat(data);
				_socket.emit('lobbychats',data);
			} 
			return nobubble(e);
		};
		
		var doChatSubmit = function(e) {
			var chatbox  = $(this).parents(".chatbox:first");
			var chattext = $(this).find(".chattext");
			var spieler  = chatbox.attr("data-spieler");
			var message  = chattext.val();
			_socket.emit('lobbychat',{from:_username,to:spieler,text:message});
			chattext.val('');
			return nobubble(e);
		}

		var doLobbyDisplay = function(e,open) {
			var icon  = $("#lobby > #icon");
			var panel = $("#lobby > #panel");
			var title = $("#lobby > h2");
			if (panel.data("open") && !open) {
				icon.attr("src",icon.attr("data-flop")).removeClass("open");
				panel.hide('fast').data("open",false);
				title.hide('fast').data("open",false);
			} else {
				icon.attr("src",icon.attr("data-flip")).addClass("open");
				panel.show('fast').data("open",true);
				title.show('fast').data("open",true);
			}
			return nobubble(e);
		}
		
		var doListDisplay = function(e) {
			var source = $(this);
			var target = $(this).next();
			if (target.is(":visible")) {
				target.hide('fast');
				source.find('span').text('^');
			} else {
				target.show('fast');
				source.find('span').text('>');	
			}
			return nobubble(e);
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

			//Checks for an existing session, and enables the lobby if successful
			$.get("/session",function(data,status){
				if(status==="success" && data && data.username) {
					_username = data.username

					_socket.on('lobbyadd', onLobbyAdd);
					_socket.on('lobbychat', onLobbyChat);
					_socket.on('lobbychats', onLobbyChats);
					_socket.on('lobbyremove', onLobbyRemove);
					_socket.on('lobbychallenge', onLobbyChallenge);
					_socket.on('lobbychallengeaccept', onLobbyChallengeAccepted);
					_socket.on('lobbychallengedecline', onLobbyChallengeDeclined);		
		
					$("body")
						.on("mouseenter",".spieler",doHoverEnter)
						.on("mouseleave",".spieler",doHoverLeave)
						.on("click",".spieler .chatstart",doChatSpieler)
						.on("click",".spieler .challenge",doChallengeSpieler)
						
					$("#lobby")
						.show()
						.on("click","h3",doListDisplay)
						.on("click","#icon",doLobbyDisplay)
						.on("submit",".chatform",doChatSubmit);		
					
					$("#lobby > h2").text(_username);					
					
					$.get("/online",function(data,status){
						if(status==="success" && data) {
							$(".spieler").removeClass("online");
							for(var i=0,l=data.online.length;i<l;i++) {
								//$("#online").render("lobbyonline",{spieler:_online[i]});
								onLobbyAdd({username:data.online[i]});
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