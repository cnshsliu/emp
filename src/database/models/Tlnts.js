const Mongoose = require('mongoose');

const TlntsSchema = new Mongoose.Schema({
  ctgry: {type: String, index: 1},
  authorid: {type: String, index: 1},
  authorname: {type: String, index: 0},
  subject: {type: String, index: 0},
  doc: {type: String, index: 0},
  webp: {type: String, index:1},
  pos: {type: Number, index: 0},
  approved: {type: Boolean, index: 1},
  read: [{
    readerid: String,
    readername: String,
    ts: {type: Date, default: Date.now},
  }],
  like: [{
    readerid: String,
    readername: String,
  }],
  ts: {type: Date, default: Date.now},
});

const Tlnts = Mongoose.model('Tlnts', TlntsSchema);

module.exports = Tlnts;
