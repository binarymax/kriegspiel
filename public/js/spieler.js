(function(){

	var username = location.href.substr(location.href.lastIndexOf('/')+1);
	$("#username").text(username);
	$("#heading").show();

	var onehalf = $("script[data-template='half']").html();

	//Naive jquery render
	$.fn.render = function(template,data) {
		var $target = this;
		var source = $("script[data-template='"+template+"']").html();
		for(var i=0,l=data.length,html,record,rekey;i<l;i++) {
			record = data[i];
			html = source;
			for(var key in record) { 
				if(record.hasOwnProperty(key)) {
					rekey = new RegExp("\{\{"+key+"\}\}","g");
					html  = html.replace(rekey,record[key]);
				}
			}
			$target.append(html.replace(/0\.5/g,onehalf).replace(/\.5/g,onehalf));
		};
		return $target;
	}

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