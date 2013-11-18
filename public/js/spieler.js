(function(){

	var username = location.href.substr(location.href.lastIndexOf('/')+1);
	$("#username").text(username);
	$("#heading").show();

	var loaded = 0;
	var ready = function(){
		if (++loaded===2) kriegspiel.lobby.init();
	}
	

	$.get("/spielers?username="+username,function(data,status){
		if(status==="success" && data) {
			$("#profile").render("spieler",data);
		}
		ready();
	});

	$.get("/replays?username="+username,function(data,status){
		if(status==="success" && data) {
			data.sort(function(a,b){  return (new Date(b.enddate)) - (new Date(a.enddate))  });
			$("#finished").render("finished",data);
		}
		ready();
	});

})();