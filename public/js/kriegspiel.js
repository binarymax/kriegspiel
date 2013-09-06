var kriegspiel = (function() {

	var _socket = io.connect('http://'+document.domain);
	var _gameid = location.href.substr(location.href.indexOf('/game/')+6);
	var _active = false;
	var _color;
	var _board;
	 
	//Announces a message to the player
	var announce = function(data) {
		$("#console > ul").append("<li class='"+data.who+"-message'>"+data.message+"</li>")
	};

	//Activates player's ability to move
	var activate = function() {
		_active=true;
	}
	
	//Deactivates player's ability to move
	var deactivate = function() {
		_active=false;
	}
	
	//-----------------------------------------
	//Socket Events
	var onMove = function (data) {
		announce(data);
		if (data.type === 'start') activate();
		else deactivate();
	};
	
	var onCapture = function (data) {
		announce(data);
		if (data.who !== _color) _board.trash(data.square);
		if (data.type === 'start') activate();
		else deactivate();
	};

	var onIllegal = function (data) {
		announce(data);
		if (data.type === 'start') activate();
		else deactivate();
	}
	
	var onEnd = function (data) {
		announce(data);
	}

	var onKriegspiel = function(data) {
		_color = data.color;
		var p = _color.charAt(0);
		var o = p==='w'?'b':'w';		

		$("#wait").remove();
		$("#board").show();
				
		_board = new ChessBoard('board', {
		  draggable: true,
		  dropOffBoard: 'trash',
		  sparePieces: true,
		  onDrop:drop,
		  orientation: _color,
		  fade: o
		});

		_board.start(false);
		
		$("img[data-piece^="+o+"]").addClass("faded-piece");
		$(".spare-pieces-bottom-ae20f").hide();
		
		if (_color==='white') activate();
	};

	//-----------------------------------------
	//Client events	
	var move = function(source, target, piece, newPos, oldPos, orientation) {
		_socket.emit('move',{gameid:_gameid,source:source,target:target});
		deactivate();		
	}

	var drop = function(source, target, piece, newPos, oldPos, orientation) {
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
		} else {
			//Attempt a move
			move(source, target, piece, newPos, oldPos, orientation);
		}
	}

	//-----------------------------------------
	//Bind events	
	_socket.on('kriegspiel', onKriegspiel);
	_socket.on('illegal', onIllegal);
	_socket.on('capture', onCapture);
	_socket.on('move', onMove);
	_socket.on('end', onEnd);
	
	//-----------------------------------------
	//Trigger event to join the game
	_socket.emit('join',{gameid:_gameid});

})();

/*


Config
Property / Type 	Required 	Default 	Description 	Example

draggable

Boolean
	no 	false 	

If true, pieces on the board are draggable to other squares.
	

Draggable Snapback

dropOffBoard

'snapback' or
'trash'
	no 	'snapback' 	

If 'snapback', pieces dropped off the board will return to their original square.

If 'trash', pieces dropped off the board will be removed from the board.

This property has no effect when draggable is false.
	

Draggable Snapback

Draggable Trash

position

'start' or
FEN String or
Position Object
	no 	n/a 	

If provided, sets the initial position of the board.
	

Start Position

Position FEN

Position Object

onChange

Function
	no 	n/a 	

Fires when the board position changes.

The first argument to the function is the old position, the second argument is the new position.

Warning: do not call any position-changing methods in your onChange function or you will cause an infinite loop.

Position-changing methods are: clear(), move(), position(), and start().
	

onChange

onDragStart

Function
	no 	n/a 	

Fires when a piece is picked up.

The first argument to the function is the source of the piece, the second argument is the piece, the third argument is the current position on the board, and the fourth argument is the current orientation.

The drag action is prevented if the function returns false.
	

onDragStart

onDragStart Prevent Drag

onDragMove

Function
	no 	n/a 	

Fires when a dragged piece changes location.

The first argument to the function is the new location of the piece, the second argument is the old location of the piece, the third argument is the source of the dragged piece, the fourth argument is the piece, the fifth argument is the current position on the board, and the sixth argument is the current orientation.
	

onDragMove

onDrop

Function
	no 	n/a 	

Fires when a piece is dropped.

The first argument to the function is the source of the dragged piece, the second argument is the target of the dragged piece, the third argument is the piece, the fourth argument is the new position once the piece drops, the fifth argument is the old position before the piece was picked up, and the sixth argument is the current orientation.

If 'snapback' is returned from the function, the piece will return to it's source square.

If 'trash' is returned from the function, the piece will be removed.
	

onDrop

onDrop Snapback

onDrop Trash

onMouseoutSquare

Function
	no 	n/a 	

Fires when the mouse leaves a square.

The first argument to the function is the square that was left, the second argument is the piece on that square (or false if there is no piece), the third argument is the current position of the board, and the fourth argument is the current orientation.

Note that onMouseoutSquare will not fire during piece drag and drop. Use onDragMove.
	

Highlight Legal Moves

onMouseoverSquare

Function
	no 	n/a 	

Fires when the mouse enters a square.

The first argument to the function is the square that was entered, the second argument is the piece on that square (or false if there is no piece), the third argument is the current position of the board, and the fourth argument is the current orientation.

Note that onMouseoverSquare will not fire during piece drag and drop. Use onDragMove.
	

Highlight Legal Moves

onMoveEnd

Function
	no 	n/a 	

Fires at the end of animations when the board position changes.

The first argument to the function is the old position, the second argument is the new position.
	

onMoveEnd

onSnapbackEnd

Function
	no 	n/a 	

Fires when the "snapback" animation is complete when pieces are dropped off the board.

The first argument to the function is the dragged piece, the second argument is the square the piece returned to, the third argument is the current position, and the fourth argument is the current orientation.
	

onSnapbackEnd

onSnapEnd

Function
	no 	n/a 	

Fires when the piece "snap" animation is complete.

The first argument to the function is the source of the dragged piece, the second argument is the target of the dragged piece, and the third argument is the piece.
	

Only Allow Legal Moves

orientation

'white' or
'black'
	no 	'white' 	

If provided, sets the initial orientation of the board.
	

Orientation

showNotation

Boolean
	no 	true 	

Turn board notation on or off.
	

Notation

sparePieces

Boolean
	no 	false 	

If true, the board will have spare pieces that can be dropped onto the board.

If sparePieces is set to true, draggable gets set to true as well.
	

Spare Pieces

showErrors

false or
String or
Function
	no 	n/a 	

showErrors is an optional parameter to control how ChessBoard reports errors.

Every error in ChessBoard has a unique code to help diagnose problems and search for solutions.

If showErrors is false then errors will be ignored.

If showErrors is 'console' then errors will be sent to console.log().

If showErrors is 'alert' then errors will be sent to window.alert().

If showErrors is a function then the first argument is the unique error code, the second argument is an error string, and an optional third argument is a data structure that is relevant to the error.
	

pieceTheme

String or
Function
	no 	'img/chesspieces/
wikipedia/{piece}.png' 	

A template string used to determine the source of piece images.

If pieceTheme is a function the first argument is the piece code.

The function should return an <img> source.
	

Piece Theme String

Piece Theme Function

appearSpeed

Number or
'slow' or
'fast'
	no 	200 	

Animation speed for when pieces appear on a square.

Note that the "appear" animation only occurs when sparePieces is false.
	

moveSpeed

Number or
'slow' or
'fast'
	no 	200 	

Animation speed for when pieces move between squares or from spare pieces to the board.
	

Animation Speed

snapbackSpeed

Number or
'slow' or
'fast'
	no 	50 	

Animation speed for when pieces that were dropped outside the board return to their original square.
	

Animation Speed

snapSpeed

Number or
'slow' or
'fast'
	no 	25 	

Animation speed for when pieces "snap" to a square when dropped.
	

Animation Speed

trashSpeed

Number or
'slow' or
'fast'
	no 	100 	

Animation speed for when pieces are removed.
	

Animation Speed
Methods
Method 	Args 	Description 	Example
clear(useAnimation) 	

useAnimation - false (optional)
	

Removes all the pieces on the board.

If useAnimation is false, removes pieces instantly.

Alias of position({}) and position({}, false)
	

Clear Board
destroy() 	none 	

Remove the widget from the DOM.
	

Destroy Board
fen() 	none 	

Returns the current position as a FEN string.

Alias of position('fen')
	

Get Position
flip() 	none 	

Flips the board orientation.

Alias of orientation('flip')
	

Orientation
move(move1, move2, etc) 	

moveN - 'e2-e4', 'g8-f6', etc
	

Executes one or more moves on the board.

Returns an updated Position Object of the board including the move(s).
	

Move Pieces
position(fen) 	

fen - 'fen' (optional)
	

Returns the current position as a Position Object.

If the first argument is 'fen', returns the position as a FEN string.
	

Get Position
position(newPosition, useAnimation) 	

newPosition - Position Object, FEN string, or 'start'

useAnimation - false (optional)
	

Animates to a new position.

If useAnimation is false, sets the position instantly.
	

Set Position
orientation() 	none 	

Returns the current orientation of the board.
	

Orientation
orientation(side) 	

side - 'white', 'black', or 'flip'
	

If 'white' or 'black', sets the orientation of the board accordingly.

If 'flip', flips the orientation.
	

Orientation
resize() 	none 	

Recalculates board and square sizes based on the parent element and redraws the board accordingly.
	

Resize
start(useAnimation) 	

useAnimation - false (optional)
	

Sets the board to the start position.

If useAnimation is false, sets the position instantly.

Alias of position('start') and position('start', false)
	

Set Position
Position Object

You can use a JavaScript object to represent a board position.

The object property names must be algebraic squares (ie: e4, b2, c6, etc) and the values must be a valid piece codes (ie: wP, bK, wQ, etc).

See an example of using an object to represent a position here.

ChessBoard exposes the ChessBoard.objToFen method to help convert between Position Objects and FEN Strings.
FEN String

You can use Forsyth-Edwards Notation (FEN) to represent a board position.

Note that FEN notation captures more information than ChessBoard requires, like who's move it is and whether or not castling is allowed. This information will be ignored; only the position information is used.

See an example of using a FEN String to represent a position here and here.

ChessBoard exposes the ChessBoard.fenToObj method to help convert a FEN String to a Position Object.
Errors

ChessBoard has an error system designed to inform you when you use the API incorrectly.

Every alert has a unique code associated with it and you can control how the errors are presented with the showErrors config option.
Error ID 	Error Text 	More Information
1001 	The first argument to ChessBoard() cannot be an empty string. 	

The first argument to the ChessBoard() constructor should be the id of a DOM element or a reference to a single DOM element.
1002 	Element with id "<id>" does not exist in the DOM. 	

ChessBoard could not find your element with document.getElementById.

Please note that if you pass a string as the first argument to the ChessBoard() constructor it should be the value of a DOM id, not a CSS selector (ie: "board", not "#board").
1003 	The first argument to ChessBoard() must be an ID or a single DOM node. 	

The first argument to the ChessBoard() constructor should be the id of a DOM element or a reference to a single DOM element.
1004 	JSON does not exist. Please include a JSON polyfill. 	

ChessBoard requires a JSON implementation. Please include a polyfill for older browsers.
1005 	Unable to find a valid version of jQuery. Please include jQuery 1.7.0 or higher on the page. 	

ChessBoard requires jQuery version 1.7.0 or higher.
2826 	Invalid move passed to the move method. 	

Moves must be a string in the form of 'e2-e4', 'b8-c6', etc.
5482 	Invalid value passed to the orientation method. 	

The first argument to the orientation method must be 'white', 'black', or 'flip'.
6482 	Invalid value passed to the position method. 	

Position must be either 'start', a valid FEN String, or a valid Position Object.
7263 	Invalid value passed to config.position 	

Position must either be 'start', a valid FEN String, or a Position Object.
8272 	Unable to build image source for cfg.pieceTheme. 	

This is an internal ChessBoard error that you should never see.

If you see this error please open a GitHub issue.

*/