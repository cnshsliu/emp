/**
 * # Channel.js
 *
 * The channel document for Mongoose
 *
 */
'use strict';
/**
 * ## Imports
 *
 */
//Mongoose - the ORM
var Mongoose = require('mongoose'),
    //The document structure definition
    Schema = Mongoose.Schema;

var uniqueValidator = require('mongoose-unique-validator');
var crypto = require('crypto');

//Same fields as Parse.com
var ChannelSchema = new Schema({
  name: {type: String,  unique: true, required: [true, "不能为空"],  index:true},
  slogan: {type: String},
  pwd: {type: String,  required:[true, "不能为空"], match: [/^[a-zA-Z0-9]+$/, 'is invalid']},
  bg: {type: String},
  round: {type: Number, default: 1},
  startat: {type: Number, default: 0},
  allowsb: {type: Boolean, default: false},
  minready: {type: Number, default: 3},
  betat: {type: Number, default: 0},
  bar : {type: Number, default: 1000},
  minbet: {type: Number, default: 10},
  maxbet: {type: Number, default: 1000},
  deal: {type: [Number], default: [5, 3]},
  state: {type: String, default: 'GETREADY'},
  step: {type: String, default: 'START'},
  banker: {type: String, default: ''},
  owner: {type: String, default: ''},
  auto: {type: Boolean, default: true},
  autostart: {type: Boolean, default: true},
  qiang: [ { bs: {type: Number, default: 1}, } ],
  younius: [ { youniu: {} } ],
  xiazhus: [{ bs: {type: Number, default: 1} } ],
  showcards: {},
  readyids: {},
  bets: {},
  hands: {},
  jsr: [],
  gamers: [
    {
      mimo:{type: Mongoose.Schema.Types.ObjectId, ref: 'Mimo'},
      online: {type: Boolean, default: false},
      lastSeen: {type: Number },
      ready: {type: Boolean, default: false},
    }
  ],
  seats: {type: Number, default: 4},

}, {timestamps: false});

ChannelSchema.methods.play = function (_id ) {
}

ChannelSchema.plugin(uniqueValidator, {message: '同名已经被占用.'});
ChannelSchema.statics.signin = async function (uid, password) {
  let that = this;
  let filter = {uid:  uid};
  const channel = await this.findOne({ uid: uid });
  if(channel.validPassword(password)){
    return (({_id, uid, nick, balance})=>({_id, uid, nick, balance}))(channel);
  }else
    throw new Error('用户名或密码错误');
}


/**
 * ## Mongoose model for Channel
 *
 * @param ChannelSchema - the document structure definition
 *
 */
var channel = Mongoose.model('Channel', ChannelSchema);

module.exports = channel;
