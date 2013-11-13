var kriegspiel = window.kriegspiel;
	kriegspiel = kriegspiel||{};
if(!kriegspiel.lobby) {
	kriegspiel.lobby = (function(){
	
		var _online = [];	
	
		var _socket  = io.connect('http://'+document.domain);
		var _tooltip = $('<div class="tooltip"></div>');

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
		
		//Mouseover spieler elements, show tooltip
		var onHoverEnter = function(e) {
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
		var onHoverLeave = function(e) {
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
				.on("mouseenter",".spieler",onHoverEnter)
				.on("mouseleave",".spieler",onHoverLeave);
		}		
				
		_socket.on('lobbyadd', onLobbyAdd);
		_socket.on('lobbyremove', onLobbyRemove);

		return {
			init:init,
			check:check
		}
	
	})();
}