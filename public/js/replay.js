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
	var _gameid  = location.href.substr(location.href.indexOf('/games/')+7);
	
	var _color; //Your color
	var _oppos; //Your opponents color
	var _board; //Your board
	var _p,_o;  //First chars of your color and opponents color
	var _temp;  //Temporary position to reset illegal moves
	var _game;  //Game data loaded from server
	var _move;  //Current move number
	
	//Common board functions:
	var ranks = '1,2,3,4,5,6,7,8'.split(',');
	var files = 'a,b,c,d,e,f,g,h'.split(','); 
	var getFile  = function(f){ return f.charCodeAt(0)-97; }  //returns array index of file letter
	var getRank  = function(r){ return parseInt(r)-1; } //returns array index of rank number
	
	//Announces a message to the player
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
		if(!noscroll) setTimeout(function(){
			//Scroll to the bottom
			var top = 0;
			$list.find("li").each(function(){top+=$(this).height()+20;});
			$console.animate({scrollTop:top},500);
		},100);
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

	var movePiece = function(move,num) {
		_board.move(move);
		if(num>0) enableOption("prevmove");
		else disableOption("prevmove");
		if(num<_game.history.length-1) enableOption("nextmove");
		else disableOption("nextmove");
	};
	
	var prevMove = function(){
		if(_move>0) {
			var from = _game.history[_move].to; 
			var to = _game.history[_move].from;
			_move--;
			movePiece(from+'-'+to,_move);
		}
	};

	var nextMove = function(){
		if(_move<_game.history.length-1) {
			_move++;
			var from = _game.history[_move].from;
			var to = _game.history[_move].to;
			movePiece(from+'-'+to,_move);
		}
	};

	//Fired when player joins
	var loadGame = function(data) {

		_game = data;
		_move = -1;

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


		if(!_board) {
			_board = new ChessBoard('board', {
			  draggable: false,
			  sparePieces: false,
			  orientation: _color,
			  assetHost: 'http://static.krgspl.com/krgspl'
			}); 

			_board.start(false);
		}
				
		disableOption("prevmove");
		enableOption("nextmove");
				
	};

	//Fired when game has an error
	var errorGame = function(data) {
		$("#wait").text("There was an error loading the game.");
	};

	//-----------------------------------------
	//Client events	
	var nobubble = function(e) { e.preventDefault&&e.preventDefault(); e.stopPropagation&&e.stopPropagation(); return false;};

	var onPrevMove = function(e) {
		prevMove();
		return nobubble(e);
	};

	var onNextMove = function(e) {
		nextMove();
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
	$("#prevmove").on("click",onPrevMove);
	$("#nextmove").on("click",onNextMove);
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