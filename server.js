var application_root = __dirname,
  express = require("express"),
  path = require("path"),
  mongoose = require('mongoose'),
  http = require('http'),
  cradle = require('cradle'),
  util = require('util'),
  im = require('imagemagick'),
  gm = require('gm').subClass({ imageMagick: true }),
  chrono = require('chrono-node');

  


var AWS = require('aws-sdk');
//AWS.config.loadFromPath('./config.json');

var express = require('express'),
  http = require('http'),
  path = require('path'),
  mongoose = require('mongoose'),
  application_root = __dirname;
  

var app = express()
  .use(express.bodyParser())
  .use(express.static('public'));
  
app.configure (function() {
	app.use(express.methodOverride());
	app.use(app.router);
	app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});

app.all('*', function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "X-Requested-With");
  next();
 });

// Here we find an appropriate database to connect to, defaulting to
// localhost if we don't find one.  
var uristring = 
  process.env.MONGOLAB_URI || 
  process.env.MONGOHQ_URL || 
  'mongodb://localhost/my_database';
  
// The http server will listen to an appropriate port, or default to
// port 5000.
var theport = process.env.PORT || 5000;

// Makes connection asynchronously.  Mongoose will queue up database
// operations and release them when the connection is complete.
mongoose.connect(uristring, function (err, res) {
  if (err) { 
    console.log ('ERROR connecting to: ' + uristring + '. ' + err);
  } else {
    console.log ('Succeeded connected to: ' + uristring);
  }
});



var RightNow = mongoose.model('RightNow', new mongoose.Schema({
	from: String,
	date_created: String,
	subject: String,
	text: String,
	parsed_date: Date,
	date: Date,
	hour: Number,
	minute: Number,
	time: Boolean,
	tags: Array,
	images: Array
}));

/*RightNow.collection.ensureIndex( { text: "text" }, function(error, res) {
	if(error) console.log("failed ensureIndex", error);
	else console.log("ensureIndex succeeded", res);
} );*/


app.configure(function(){
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(app.router);
  app.use(express.static(path.join(application_root, "public")));
  app.use(express.errorHandler({ dumpExceptions: true, showStack: true }));
});



app.get('/view', function(req, res){
    res.sendfile(__dirname + '/public/index.html');
});

app.get('/api/items', function(req, res){
  return RightNow.find(function(err, events) {
    return res.send(events);
  });
});

app.get('/api/items/:id', function(req, res){
  return RightNow.findById(req.params.id, function(err, event) {
    if (!err) {
      return res.send(event);
    }
  });
});

app.get('/api/search', function(req, res){
	var start = new Date(100, 01, 01);
	var end = new Date(2100, 12, 31);
	if(req.query.after) start = new Date(req.query.after);
	if(req.query.before) end = new Date(req.query.before);	
	var query = {};
	var datequery = {};
	datequery["$gte"] = start;
	datequery["$lte"] = end;
	query["date"]  = datequery;
	if(req.query.tag) query["tags"] = req.query.tag;
	if(req.query.q) {
		var textquery = {};
		textquery["$search"] = req.query.q;
		query["$text"] = textquery;
	}
	console.dir(query);
	return RightNow.find(query, function(err, events) {
		return res.send(events);
	});
});

app.put('/api/items/:id', function(req, res){
  return RightNow.findById(req.params.id, function(err, event) {
    event.subject = req.body.subject;
    event.parsed_date = req.body.date;
    event.time = req.body.time;
    event.imgurl = req.body.imgurl;
    event.text = req.body.text;

    return event.save(function(err) {
      if (!err) {
        console.log("updated");
      }
      return res.send(event);
    });
  });
});



app.delete('/api/items/:id', function(req, res){
  return RightNow.findById(req.params.id, function(err, event) {
    return event.remove(function(err) {
      if (!err) {
        console.log("removed");
        return res.send('')
      }
    });
  });
});


app.get('/postmark', function(req, res){
	var date = chrono.parse("july 25th 2pm");
	var d = new Date(date[0].startDate);
	console.dir(d);
	console.dir(date[0].start.hour);
	return res.send(chrono.parse("july 25th 2pm"));
});

app.post('/postmark', function(req, res){
  var item;
  var s3 = new AWS.S3();

  var allText = req.body.Subject + " " + req.body.TextBody;
  var dates = chrono.parse(allText);
  var parsed_date = null;
  var time = false;
  var hour, minute, date = -1;
  if(dates[0]) {
  	parsed_date = new Date(dates[0].startDate);
		date = new Date(dates[0].start.year, dates[0].start.month, dates[0].start.day);
  	if(dates[0].start.hour) {
  		time = true; 
  		hour = dates[0].start.hour;
  		minute = dates[0].start.minute;
  	}
  }
  
  var cleantags = [];

  var tags = req.body.TextBody.match(/#\S+/g);
  if(tags) {    		
    tags.forEach(function(val, i) {
    	var n = val.length -1;
    	if(val[n] == "." || val[n] == ",") val = val.substr(0, n); 
      tags[i] = val.substr(1);
	  
		});
  }
  
  item = new RightNow({
		subject: req.body.Subject,
		date_created: new Date(),
		text: req.body.TextBody,
		from: req.body.From,
		parsed_date: parsed_date,
		time: time,
		tags: tags,
		date: date,
		hour: hour,
		minute: minute

  });
  
	if(req.body.Attachments) {
	req.body.Attachments.forEach(function(val, index) {

		var buffer = new Buffer(val.Content, "base64");
		var rand = Math.random().toString(36).substring(3);
		var folder = rand + val.Name;
		var key = "small_" + rand + val.Name;
		var type = val.ContentType;
	
	
	
		gm(buffer, folder).autoOrient().resize(800).toBuffer(function (err1, buffer1) {
		  if (err1) console.dir(err1);	
		  var opts = {Bucket: 'timeslice', Key: folder, Body: buffer1, ACL: "public-read"};
			s3.putObject(opts, function (a, b) {
				console.dir(a);
				console.dir(b);
			});		  		  
		});
	
		gm(buffer, folder).autoOrient().resize(400).toBuffer(function (err2, buffer2) {
		  if (err2) console.dir(err2);		  
		  var opts2 = {Bucket: 'timeslice', Key: key, Body: buffer2, ACL: "public-read"};
			s3.putObject(opts2, function (a, b) {
				console.dir(a);
				console.dir(b);
			});		  		  
		});

		item.images.push(folder);
	
		});
	}	
		
	item.save();
		
    	    
  return res.send(item);
});



app.get('/api/keyword/:tag', function(req, res){
  return RightNow.find({tags: req.params.tag}, function(err, tags) {
  	if(tags) {
		
			return res.send(tags);

	} else return res.send('none found');
  });
});

app.get('/api/items/q:tag', function(req, res){
  return RightNow.find({tags: req.params.tag}, function(err, tags) {
  	if(tags) {
		
			return res.send(tags);

	} else return res.send('none found');
  });
});



var theport = process.env.PORT || 5000;
http.createServer(app).listen(theport, function () {

  console.log("Server ready at http://localhost:"+theport);
});