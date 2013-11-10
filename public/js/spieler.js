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

	$.get("/spielers?username="+username,function(data,status){
		if(status==="success" && data) {
			$("#profile").render("spieler",data);
		}
	});

	$.get("/replays?username="+username,function(data,status){
		if(status==="success" && data) {
			$("#finished").render("finished",data);
		}
	});

})();