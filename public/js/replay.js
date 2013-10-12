/******************************************
* KRIEGSPIEL
*   Copyright 2013, Max Irwin
*   MIT License
*
* Client Side Replay
*
*******************************************/

var replay = (function() {

	var _variant = {'occupies':true};
	var _colors  = {'w':'white','b':'black'};
	var _colorx  = {'white':'black','black':'white'};
	var _gameid  = location.href.substr(location.href.indexOf('/replays/')+9);

	var _hist = []; //Position history (for prevMove)
	
	var _color;  //Your color
	var _oppos;  //Your opponents color
	var _chess;  //Chess logic
	var _board;  //Your board
	var _game;   //Game data loaded from server
	var _hlen=0; //Total Moves
	var _move=1; //Current move number
	
	//Common board functions:
	var ranks = '1,2,3,4,5,6,7,8'.split(',');
	var files = 'a,b,c,d,e,f,g,h'.split(','); 
	var getFile  = function(f){ return f.charCodeAt(0)-97; }  //returns array index of file letter
	var getRank  = function(r){ return parseInt(r)-1; } //returns array index of rank number
	
	//Announces a message to the player
	var scrollId = 0;
	var announce = function(data,noscroll) {
		var $list = $("#console > ul");
		var $console = $("#console");
		var whoclass = data.who+"-message";
		var whatclass = data.who+"-"+data.type;
		if (data.type!=="welcome" || $list.find("li."+whatclass).length===0) {
			var $message = $("<li class='"+ whoclass + " " + whatclass +"' data-type='" + data.type + "'>"+data.message+"</li>")
			$list.append($message);
		}
		if (data.type==="welcome" && data.username) {
			$("#player"+data.who).text(data.username);
		}
		if(!noscroll) {
			clearTimeout(scrollId);
			scrollId = setTimeout(function(){
				//Scroll to the bottom
				var top = 0;
				$list.find("li").each(function(){top+=$(this).outerHeight(true);});
				$console.finish().animate({scrollTop:top},500);
			},100);
		}
	};

	//Clear the console and load a list of messages
	var loadmessages = function(messages) {
		var $list = $("#console > ul");
		$list.children().remove();
		for(var i=0,l=messages.length;i<l;i++) {
			announce(messages[i],i!==(l-1));
		}
	};

	var disableOption = function(option) {
		$("#"+option).addClass("disabled").attr("disabled","disabled");
	};

	var enableOption = function(option) {
		$("#"+option).removeClass("disabled").removeAttr("disabled");
	};

	var setPosition = function(pos,num) {
		_board.position(pos.position);
		loadmessages(pos.messages);
		if(num>0) enableOption("prevmove"); else disableOption("prevmove");
		if(num!==0) enableOption("firstmove"); else disableOption("firstmove");
		if(num<_hlen) enableOption("nextmove"); else disableOption("nextmove");
		if(num!==_hlen) enableOption("lastmove"); else disableOption("lastmove");

	};
	
	var prevMove = function(){
		if(_move>0) setPosition(_hist[--_move],_move);
		_move = _move<0?0:_move;
	};

	var nextMove = function(){
		if(_move<_hlen) setPosition(_hist[++_move],_move);
		_move = _move>=_hlen?_hlen:_move;
	};

	var nextMove = function(){
		if(_move<_hlen) setPosition(_hist[++_move],_move);
		_move = _move>=_hlen?_hlen:_move;
	};

	var firstMove = function(){
		_move = 0;
		setPosition(_hist[_move],_move);
	};
	
	var lastMove = function(){
		_move = _hlen;
		setPosition(_hist[_move],_move);
	};
	
	var getMessages = function(all,num) {
		var messages = [];
		var maximum = num?num+1:1;
		for(var i=0,l=all.length;i<l;i++) {
			if(all[i].type==='welcome') all[i].movenumber=-1;
			if(all[i].movenumber<=maximum) {
				messages.push(all[i]);
			}
		}
		return messages;
	};

	//Fired when player joins
	var loadGame = function(data) {

		_game = data;
		_color = data.orientation;
		_hlen = data.history.length;
		_move = 0;

		$("#wait").remove();
		$("#board").show();
		$("#playerwhite").text(_game.whiteusername);
		$("#playerblack").text(_game.blackusername);
		var startdate = (new Date(Date.parse(_game.startdate)));
		var started = startdate.toLocaleDateString() + ' ' + startdate.toLocaleTimeString();
		var enddate = (new Date(Date.parse(_game.enddate)));
		var ended   = enddate.toLocaleDateString() + ' ' + enddate.toLocaleTimeString();
		$("#startdate").text(started);
		$("#enddate").text(ended);


		if(!_chess) {
			//Memoize the position and message history for navigation
			_chess = new Chess();
			_hist.push({position:_chess.fen(),messages:getMessages(_game.messages,0)});
			for(var i=0;i<_hlen;i++) {
				_chess.move(_game.history[i]);
				_hist.push({position:_chess.fen(),messages:getMessages(_game.messages,i)});
			}
		}

		if(!_board) {
			_board = new ChessBoard('board', {
			  draggable: false,
			  sparePieces: false,
			  orientation: _color,
			  assetHost: 'http://static.krgspl.com/krgspl'
			});

			_board.start(false);
		}

		setPosition(_hist[0],0);
		
	};

	//Fired when game has an error
	var errorGame = function(data) {
		$("#wait").text("There was an error loading the game.");
	};

	//-----------------------------------------
	//Client events	
	var nobubble = function(e) { e.preventDefault&&e.preventDefault(); e.stopPropagation&&e.stopPropagation(); return false;};

	var onFirstMove = function(e) {
		firstMove();
		return nobubble(e);
	};

	var onPrevMove = function(e) {
		prevMove();
		return nobubble(e);
	};

	var onNextMove = function(e) {
		nextMove();
		return nobubble(e);
	};

	var onLastMove = function(e) {
		lastMove();
		return nobubble(e);
	};


	var onKeyup = function(e) {
		switch(e.which) {
			case 37: prevMove(); break;
			case 39: nextMove(); break;
		}
		return nobubble(e);
	};

	//-----------------------------------------
	//Wireup Events
	$("#firstmove").on("click",onFirstMove);
	$("#prevmove").on("click",onPrevMove);
	$("#nextmove").on("click",onNextMove);
	$("#lastmove").on("click",onLastMove);
	$(document.body).on("keyup",onKeyup);


	//Load the game data from the server
	$.get("/data/"+_gameid,function(data,status){
		if(status==="success" && data) {
			loadGame(data);
		} else {
			errorGame();
		}
	});

})();