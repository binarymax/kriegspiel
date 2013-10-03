module.exports = {
	name:"lovenheim",
	rules:{
		"occupies":true,
		"pawncaptures":true
	},
	messages:{
		"illegal": "{{isactive}} has attempted an illegal move to {{square}}",
		"promoted": "{{isactive}} has promoted",
		"occupiesyes": "{{square}} is occupied by {{inactive}}",
		"occupiesno": "{{square}} is not occupied by {{inactive}}",
		"pawncapturesyes": "{{isactive}} has available pawn captures and must attempt one",
		"pawncapturesno": "{{isactive}} has no available pawn captures",
		"pawncapturestry": "{{isactive}} must attempt at least one pawn capture"

	}	
}