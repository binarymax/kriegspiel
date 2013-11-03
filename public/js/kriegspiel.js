/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*
* Client Side Game Logic
*
*******************************************/

var kriegspiel = (function() {

	var _variant = {'occupies':true};
	var _colors  = {'w':'white','b':'black'};
	var _colorx  = {'white':'black','black':'white'};
	var _socket  = io.connect('http://'+document.domain);
	var _gameid  = location.href.substr(location.href.indexOf('/games/')+7);

	var _active   = false; //Your turn is active or not
	var _sounds   = true;  //Whether to play move sounds or not
	var _tutorial = true;  //Whether to show tutorial messages or not
		
	var _color; //Your color
	var _oppos; //Your opponents color
	var _board; //Your board
	var _p,_o;  //First chars of your color and opponents color
	var _temp;  //Temporary position to reset illegal moves

	var _promotion = null; //Promotion data
	
	var _templates = {};   //UI Templates for Announcements

	//Finite State Machine for the options available to the user on the move
	var _movestate = (function(){
		var movestate = function(){this.reset()};
			movestate.prototype = {
				okOccupies:function(){ return this.occupies<0; },
				isOccupies:function(){ return this.occupies===0; },
				noOccupies:function(){ return this.occupies=-1; },
				doOccupies:function(){ return ++this.occupies; },
				okDrawOffer:function(){ return this.drawoffer<0; },
				isDrawOffer:function(){ return this.drawoffer===0; },				
				noDrawOffer:function(){ return this.drawoffer=-1; },				
				doDrawOffer:function(){ return ++this.drawoffer; },
				okPawnCaptures:function(){ return this.pawncaptures<0; },
				isPawnCaptures:function(){ return this.pawncaptures===0; },
				noPawnCaptures:function(){ return this.pawncaptures=-1; },
				doPawnCaptures:function(){ return ++this.pawncaptures; },
				reset : function(){			
					this.occupies=-1;
					this.pawncaptures=-1;
					this.drawoffer=-1;
				},
				serialize:function(){
					var self=this;
					return {
						occupies:self.occupies,
						pawncaptures:self.pawncaptures,
						drawoffer:self.drawoffer
					};
				},
				deserialize:function(states){
					var self=this;
					self.occupies=states.occupies;
					self.pawncaptures=states.pawncaptures;
					self.drawoffer=states.drawoffer;
				}
			};
		return new movestate();
	})();

	//Common board functions:
	var ranks = '1,2,3,4,5,6,7,8'.split(',');
	var files = 'a,b,c,d,e,f,g,h'.split(','); 
	var getFile  = function(f){ return f.charCodeAt(0)-97; }  //returns array index of file letter
	var getRank  = function(r){ return parseInt(r)-1; } //returns array index of rank number

	//Initializes the color variables
	var setcolor = function(color) {
		_color = color;
		_oppos = _colorx[color];
		_p = _color.charAt(0);
		_o = _oppos.charAt(0);
	}

	//Renders data to a preloaded template 
	var render = function(data,template) {
		template = template||data.type;
		var regexp;		
		var message  = _templates[template]||_templates["default"];
		for(var key in data) {
			if(data.hasOwnProperty(key) && typeof data[key] === "string") {
				regexp = new RegExp("{{"+key+"}}","g");
				message = message.replace(regexp,data[key]);
			}
		}
		return message;		
	}
	
	//Set/Get data from LocalStorage
	var store = function(key,value) {
		if (window.localStorage) {
			if (typeof value !== 'undefined') window.localStorage.setItem(key,value);  
			return window.localStorage.getItem(key);
		}
		return null;
	}	
	
	//Scroll the console to the bottom
	var scrollId = 0;
	var scroller = function() {
		var $list = $("#console > ul");
		var $console = $("#console");
		clearTimeout(scrollId);
		scrollId = setTimeout(function(){
			//Scroll to the bottom
			var top = 0;
			$list.find("li").each(function(){top+=$(this).outerHeight(true);});
			$console.finish().animate({scrollTop:top},500);
		},100);		
	}

	//Announces a message to the player
	var announce = function(data,noscroll) {
		var $list = $("#console > ul");
		var $console = $("#console");
		var helptype1 = 'tutorial-' + (data.template||data.type);
		var helptype2 = helptype1 + '-' + (data.who===_color?'player':'opponent'); 
		data.whoclass = data.who+"-message";
		data.whatclass = data.who+"-"+data.type;
		data.helpmessage = '';

		if (_templates[helptype2]) {
			data.helpmessage = render({type:helptype2,player:_color,opponent:_oppos});
		} else if (_templates[helptype1]) {
			data.helpmessage = render({type:helptype1,player:_color,opponent:_oppos});
		}

		if (data.type!=="welcome" || $list.find("li."+data.whatclass).length===0) {
			if(data.type==='offerdraw' && data.who===_color){
				$message = $(render(data,'default'))
				$list.append($message);
			} else { 
				$message = $(render(data))
				$list.append($message);
			}
		}
		if (data.type==="welcome" && data.username) {
			var startdate = (new Date(Date.parse(data.startdate)));
			var started = startdate.toLocaleDateString() + ' ' + startdate.toLocaleTimeString();
			$("#player"+data.who).text(data.username);
			$("#startdate").text(started);
		}
		if(!noscroll) {
			scroller();
		}
	};

	//Sends a client-side message to the console 
	var announceui = function(message) {
		var data = {type:"ui",who:_color,message:message};
	}
		
	var sounds = (window.Audio)?{'move':new Audio("/img/move.wav")}:{};
	var playSound = function(sound) {
		if(_sounds && window.Audio) {
			var sound = sounds[(sound||'move')];
			if (sound && sound.play) sound.play();
		}
	};

	//Fancy title thing
	var dot = 0;
	var dots = ['o..','.o.','..o'];
	var dotint = 0;
	var setTitle = function(text) { try { document.title = text + " | KRIEGSPIEL"; } catch(ex) {} };
	var setHeading = function(text) { $("#heading").text(text); };

	//Activates player's ability to move
	var activate = function(noreset) {
		if(!_active && !noreset) _movestate.reset();
		if(!_active && _sounds) playSound('move');		
		_active=true;
		clearInterval(dotint);
		setTitle('Your Move');
		setHeading('MOVE');
		resetOptions();
	}
	
	//Deactivates player's ability to move
	var deactivate = function() {
		if(_active && _sounds) playSound('move');
		disableOption("pawncaptures");
		disableOption("occupies");
		setHeading('WAIT');
		_active=false;
		dot = 0;
		clearInterval(dotint);
		dotint = setInterval(function(){ setTitle(dots[dot]); dot=++dot>=dots.length?0:dot; },1250);
	}

	//Shows the option dialog and hides the options
	var showDialog = function(option) {
		$("#options").hide();
		$("#"+option+"dialog").show();
	}
	
	//Hides the option dialog and shows the options
	var hideDialog = function(option) {
		$(".dialog").hide();
		$("#options").show();
	}

	var disableOption = function(option) {
		$("#"+option).addClass("disabled").attr("disabled","disabled");
	}

	var enableOption = function(option) {
		$("#"+option).removeClass("disabled").removeAttr("disabled");
	}

	var resetOptions = function() {
		_movestate.okPawnCaptures()&&_active?enableOption("pawncaptures"):disableOption("pawncaptures");
		_movestate.okOccupies()&&_active?enableOption("occupies"):disableOption("occupies");		
		_movestate.okDrawOffer()?enableOption("offerdraw"):disableOption("offerdraw");
		enableOption("resign");
	}

	//Returns a scratch FEN string of only the opponents pieces
	var getscratch = function(position) {
		var scratch = {};
		for(var i in position) {
			if(position.hasOwnProperty(i) && position[i].charAt(0)===_o) {
				scratch[i]=position[i];
			} 
		}
		return ChessBoard.objToFen(scratch);
	};

	//Clear the console and load a list of messages
	var loadmessages = function(messages) {
		var $list = $("#console > ul");
		$list.children().remove();
		for(var i=0,l=messages.length;i<l;i++) {
			announce(messages[i],i!==(l-1));
		}
	}
	
	//Loads the user's position and the scratch opponent placements
	var loadposition = function(position,scratch) {
		var pos = {};
		if(position&&scratch) {
			//Construct a combination of the player's own position and scratch opponent pieces
			var player = ChessBoard.fenToObj(position);
			var opponent = ChessBoard.fenToObj(scratch);
			for(var i in player) {
				if(player.hasOwnProperty(i) && player[i].charAt(0)===_p) pos[i]=player[i]; 
			}
			for(var i in opponent) {
				if(opponent.hasOwnProperty(i) && opponent[i].charAt(0)===_o) pos[i]=opponent[i]; 
			}
		} else if (position){
			//No scratch available
			pos = position;
		} else {
			//Clean slate
			pos = 'start'
		}
		
		//Set up the pieces
		_board.position(pos,false);
	}
	
	//Loads the movestate from the server, and disables actions if necessary
	var loadmovestate = function(state) {
		_movestate.deserialize(state);
		resetOptions();
	}

	//-----------------------------------------
	//Socket Events
	var onWelcome = function (data) {
		announce(data);
	}	
	
	var onMove = function (data) {
		announce(data); 
		if (data.action === 'start') activate();
		else deactivate();
	};
	
	var onCapture = function (data) {
		announce(data);
		if (data.who !== _color) _board.trash(data.square);
		if (data.action === 'start') activate();
		else deactivate();
	};

	var onEnPassant = function (data) {
		announce(data);
		if (data.who !== _color) _board.trash(data.square);
		if (data.action === 'start') activate();
		else deactivate();
	};


	var onImpossible = function (data) {
		announce(data);
		if (data.action === 'start') {
			_board.position(_temp);
			activate(true);
		} else {
			deactivate();
		}
	}

	var onIllegal = function (data) {
		announce(data);
		if (data.action === 'start') {
			_board.position(_temp);
			activate(true);
		} else {
			deactivate();
		}
	}

	var onPawnCapturesTry = function (data) {
		announce(data);
		if (data.action === 'start') {
			_board.position(_temp);
			activate(true);
		} else {
			deactivate();
		}
	}


	var onInactive = function (data) {
		announce(data);
		_board.position(_temp);
	}

	var onFinished = function (data) {
		announce(data);
		_board.position(_temp);
	}

	var onGameover = function (data) {
		announce(data);
		deactivate();
	}

	var onFinish = function (data) {
		announce(data);
		disableOption("pawncaptures");
		disableOption("occupies");
		disableOption("offerdraw");
		disableOption("resign");
		deactivate();
	}

	//Fired when player joins
	var onKriegspiel = function(data) {

		setcolor(data.color);

		$("#wait").remove();
		$("#board").show();

		if(!_board) {
			_board = new ChessBoard('board', {
			  draggable: true,
			  dropOffBoard: 'trash',
			  sparePieces: true,
			  onDrop:drop,
			  onDragStart:drag,
			  orientation: _color,
			  fade: _o,
			  assetHost: 'http://static.krgspl.com/krgspl'
			}); 

			_board.start(false);

			$(".spare-pieces-bottom-ae20f").hide();
		}
		
		var turn = 'white';
		if (data.game) {
			turn = _colors[data.game.turn||'w'];
			loadposition(data.game.position,data.game.scratch);
			loadmessages(data.game.messages||[]);			
		}

		if (_color===turn) activate(); else deactivate();
		if (data.game) loadmovestate(data.game[turn+'state']);
		
	};

	//-----------------------------------------
	//Client events	
	var nobubble = function(e) { e.preventDefault&&e.preventDefault(); e.stopPropagation&&e.stopPropagation(); return false;};

	//Castles a rook
	var castle = function(castleType,newPos) {
		if (newPos[castleType.source] === castleType.piece) {
			newPos = _board.move(castleType.source + '-' + castleType.target);
		}
		return newPos;
	};

	//Check to see if move is a castle
	var checkCastle = function(source,target,piece) {
		if(piece.charAt(1).toLowerCase()!=='k') return false;
		if(_color==='white' && source==='e1') {
			if (target==='g1') return {source:'h1',target:'f1',piece:'wR'};
			if (target==='c1') return {source:'a1',target:'d1',piece:'wR'};
		} else if (source==='e8') {
			if (target==='g8') return {source:'h8',target:'f8',piece:'bR'};
			if (target==='c8') return {source:'a8',target:'d8',piece:'bR'};
		}
		return false;
	};
	
	//Promotes a piece
	var promote = function(piece) {
		_promotion.newPos[_promotion.target] = _p + piece.toUpperCase();
		_board.position(_promotion.newPos);
		move(_promotion.source, _promotion.target, _promotion.piece, _promotion.newPos, _promotion.oldPos, _promotion.orientation, piece);
		_promotion = null;
	};

	//Check to see if move is a promotion
	var checkPromotion = function(source,target,piece) {
		_promotion = null;
		if(piece.charAt(1).toLowerCase()!=='p') return false;
		var sr = parseInt(source.charAt(1)), sf = getFile(source.charAt(0));
		var tr = parseInt(target.charAt(1)), tf = getFile(target.charAt(0));
		if(_color==='white' && tr===8) {
			if(sr!==7 || Math.abs(sf-tf)>1) return 'impossible';
			showDialog("promote");
			$("#promotiondialog").attr("data-target",target);
			return true;
		} else if(target.charAt(1)==='1') {
			if(sr!==2 || Math.abs(sf-tf)>1) return 'impossible';
			showDialog("promote");
			$("#promotiondialog").attr("data-target",target);
			return true;
		}
		return false;
	};


	//Moves a piece on the server
	var move = function(source, target, piece, newPos, oldPos, orientation, promotion) {
		clearOccupies();
		var castleType = checkCastle(source,target,piece);
		if (castleType) newPos = castle(castleType,newPos);
		var movedata = {gameid:_gameid,source:source,target:target,scratch:getscratch(newPos)};
		if (promotion) movedata.promotion = promotion;
		_socket.emit('move',movedata);
		deactivate();
	};

	//Piece was dropped on the chessboard
	var drop = function(source, target, piece, newPos, oldPos, orientation) {
		var promotion = null;
		var color = piece.charAt(0);
		if (color!==_color.charAt(0)) {
			//Player is just messing around with opposing pieces
			return true;
		} if (!_active) {
			//Not your turn!
			return 'snapback';
		} else if(source === 'spare') {
			//No spares for you!
			return 'snapback';
		} else if (target === 'offboard') {
			//No trash for you!
			return 'snapback';
		} else if (source === target) {
			//Not a move
			return 'snapback';			
		} else if (promotion = checkPromotion(source,target,piece)) {
			if(promotion === 'impossible') return 'snapback'; //naughty!
			//Promotion OK! Cache the drop event:
			_promotion = {source:source, target:target, piece:piece, newPos:newPos, oldPos:oldPos, orientation:orientation};
		} else {
			//Attempt a move
			_temp = oldPos;
			move(source, target, piece, newPos, oldPos, orientation);
		}
	};
	
	var drag = function(source, piece, position, orientation) {
		if (_movestate.okOccupies() && $("div[data-square='"+source+"']").hasClass('highlight-occupies')) {
			doOccupiesSquare(source);
			return false;
		}
	};


	var doPawncaptures = function(e){
		if(_active && _movestate.okPawnCaptures()) {
			_socket.emit('pawncaptures',{gameid:_gameid});
			_movestate.doPawnCaptures();
			resetOptions();
		}
		return nobubble(e);
	};

	var clearOccupies = function(show) {
		if (show) showDialog("occupies"); else hideDialog("occupies");
		for(var f=0;f<8;f++) { 
			for(var r=0;r<8;r++) { 
				$('.square-'+files[f]+ranks[r]).removeClass('highlight-square').removeClass('highlight-occupies');
			}
		} 
	}

	var doOccupiesSquare = function(e) {
		clearOccupies();
		if(_active && _variant.occupies && _movestate.okOccupies()) {
			var square = (typeof e === "string") ? e : $(this).attr("data-square");
			_movestate.doOccupies();
			_socket.emit('occupies',{gameid:_gameid,target:square});
			resetOptions();
		}
		return nobubble(e);
	}

	var doOccupies = function(e){
		clearOccupies(true);
		if(_active && _variant.occupies && _movestate.okOccupies()) {
			var f,r;
			var position = _board.position();
			var hasPiece = function(sq) { return (position.hasOwnProperty(sq) && position[sq].charAt(0)===_p)?true:false; }
			var addAdj   = function(fx,ry) { 
				if(fx && ry && !hasPiece(fx+ry)) {
					$('.square-'+ fx+ry).attr("data-square",fx+ry).addClass('highlight-square').addClass('highlight-occupies'); 
				}
			};
			for(var sq in position) {
				if (hasPiece(sq)) {
					f = getFile(sq.charAt(0));
					r = getRank(sq.charAt(1));
					for(var x=-1;x<=1;x++) {
						for(var y=-1;y<=1;y++) {
							if(x||y) addAdj(files[f+x],ranks[r+y]);			
						}
					}
				}
			}
		}
		return nobubble(e);
	};

	var doOccupiesCancel = function(e){
		clearOccupies();
		_movestate.noOccupies();
		return nobubble(e);
	}
	
	var doPromotion = function(e){
		if(_active && _promotion) promote($(this).attr("data-piece"));
		hideDialog("promote")
		return nobubble(e);
	};

	var doOfferdraw = function(e){
		if(_movestate.okDrawOffer()) {
			_movestate.doDrawOffer();
			showDialog("offerdraw");
		} else {
			disableOption('offerdraw');
			announceui("You already offered a draw");
		}
		return nobubble(e);
	};

	var doOfferdrawYes = function(e){
		if(_movestate.isDrawOffer()) {
			_movestate.doDrawOffer();
			_socket.emit('offerdraw',{gameid:_gameid});
			disableOption('offerdraw')
		}
		hideDialog("offerdraw");
		return nobubble(e);
	};

	var doOfferdrawCancel = function(e){
		hideDialog("offerdraw");
		return nobubble(e);
	};

	var doResign = function(e){
		showDialog("resign");
		return nobubble(e);
	};

	var doResignYes = function(e){
		hideDialog("resign");
		disableOption('resign')
		_socket.emit('resign',{gameid:_gameid});
		return nobubble(e);
	};

	var doResignCancel = function(e){
		hideDialog("resign");
		return nobubble(e);
	};

	var doAcceptDraw = function(e){
		var message = $(this).parent();
		message.find(".messagebutton").remove();
		message.append("<span><em>(Draw Accepted!)</em></span>");
		_socket.emit('acceptdraw',{gameid:_gameid});
		return nobubble(e);
	};

	var doDeclineDraw = function(e){
		var message = $(this).parent();
		message.find(".messagebutton").remove();
		message.append("<span><em>(Draw Declined!)</em></span>");
		_socket.emit('declinedraw',{gameid:_gameid});
		return nobubble(e);
	};

	var doReplay = function(e){
		location.href = "/replays/"+_gameid;
		return nobubble(e);
	};
	
	var doChat = function(e){
		$text = $("#chattext");
		if ($text.val().length>0) {
			_socket.emit('chat',{gameid:_gameid,text:$text.val()});
			$text.val('');
		}
		return nobubble(e);
	}

	var doTutorial = function(e){
		var self = $(this);
		var label = self.parent();
		_tutorial = self.is(":checked");
		store("tutorial",_tutorial);
		if (_tutorial) {
			label.removeClass("faded-logo");
			$("#console").addClass("tutorial"); 
		} else {
			label.addClass("faded-logo");
			$("#console").removeClass("tutorial");
		}
		scroller(); 
		return nobubble(e);
	};

	var doSounds = function(e){
		var self = $(this);
		var label = self.parent();
		_sounds = self.is(":checked");
		store("sounds",_sounds);
		if (_sounds) label.removeClass("faded-logo"); else label.addClass("faded-logo"); 
		return nobubble(e);
	};

	$.fn.initFlag = function(key) {
		var jq = this;
		var flag = (store(key)||'').toString();
		switch (flag) {
			case 'true': jq.attr("checked","checked").val("checked"); break;
			case 'false': jq.removeAttr("checked").val(""); break;
		}

		jq.trigger("change");
		return jq;
	}

	//-----------------------------------------
	//Load the templates	
	$("script[data-type=template]").each(function(){
		_templates[$(this).attr("data-template")] = $(this).html();
	});

	//-----------------------------------------
	//Bind Socket Response Events	
	_socket.on('welcome', onWelcome);
	_socket.on('promoted', announce);
	_socket.on('occupies', announce);
	_socket.on('offerdraw', announce);	
	_socket.on('acceptdraw', announce);	
	_socket.on('declinedraw', announce);	
	_socket.on('pawncaptures', announce);

	_socket.on('pawncapturestry', onPawnCapturesTry);
	_socket.on('kriegspiel', onKriegspiel);
	_socket.on('impossible', onImpossible);
	_socket.on('enpassant', onEnPassant);
	_socket.on('inactive', onInactive);
	_socket.on('finished', onFinished);
	_socket.on('gameover', onGameover);	
	_socket.on('illegal', onIllegal);
	_socket.on('capture', onCapture);
	_socket.on('finish', onFinish);
	_socket.on('check', announce);
	_socket.on('chat', announce);
	_socket.on('move', onMove);
		
	//-----------------------------------------
	//Wireup events for buttons and ui
	$("#pawncaptures").on("click",doPawncaptures);

	$("#occupies").on("click",doOccupies);
	$("#occupiescancel").on("click",doOccupiesCancel);

	$("#offerdraw").on("click",doOfferdraw);
	$("#offerdrawyes").on("click",doOfferdrawYes);
	$("#offerdrawcancel").on("click",doOfferdrawCancel);

	$("#resign").on("click",doResign);
	$("#resignyes").on("click",doResignYes);
	$("#resigncancel").on("click",doResignCancel);

	$("#console").on("click",".acceptdraw",doAcceptDraw);
	$("#console").on("click",".declinedraw",doDeclineDraw);
	$("#console").on("click",".replay",doReplay);

	$("#tutorial").on("change",doTutorial).initFlag("tutorial");
	$("#sounds").on("change",doSounds).initFlag("sounds");

	$(".promotebutton").on("click",doPromotion);

	$("#board").on("click",".highlight-occupies",doOccupiesSquare);

	$("#chatform").on("submit",doChat);

	//-----------------------------------------
	//Trigger Socket Request Event to join the game
	_socket.emit('join',{gameid:_gameid});


})();