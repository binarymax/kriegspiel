(function(){

	$.get("/replays",function(data,status){
		if(status==="success" && data) {
			$("#finished").render("finished",data);
		}
		kriegspiel.lobby.init();
	});

})();