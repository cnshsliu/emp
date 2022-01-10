// --------------------------------------------------
//    Custom Error
// --------------------------------------------------

function CommentReferenceError(message) {
  this.name = "CommentReferenceError";
  this.message = message || "This comment does not belong to the given article !";
  this.stack = new Error().stack;
}

CommentReferenceError.prototype = Object.create(Error.prototype);
CommentReferenceError.prototype.constructor = CommentReferenceError;

// --------------------------------------------------
//    Helpers
// --------------------------------------------------

function joiResponseErrorHandler(err) {
  if (err.isJoi) {
    let response = {
      errors: {},
    };

    err.details.forEach((error) => {
      response.errors[error.context.key] = [error.message];
    });

    return response;
  }

  return null;
}

function defaultResponseErrorHandler(err) {
  let response = {};

  response.statusCode = 400;
  response.error = err.name;
  response.code = "default";
  response.message = err.message;
  response.details = err.details;

  return response;
}

function mongooseResponseValidationErrorHandler(err) {
  if (err.name && err.name === "ValidationError") {
    let response = {
      errors: {},
    };

    var keys = Object.keys(err.errors);
    for (var index in keys) {
      var key = keys[index];
      console.log("Key=", key);
      if (err.errors[key].hasOwnProperty("message")) {
        response.errors[key] = [`"${err.errors[key].value}" ${err.errors[key].message}`];
      }
    }

    return response;
  }

  return null;
}
function mongooseErrorHandler(err) {
  console.log("err.name=", err.name);
  console.log(JSON.stringify(err));
  //err={"driver":true,"name":"MongoError","index":0,"code":11000,"keyPattern":{"email":1},"keyValue":{"email":"liukehong@gmail.com"}}
  if (err.name && err.name === "MongoError") {
    let response = {};

    response.statusCode = 400;
    response.code = err.code;
    if (err.code === 11000) {
      var keys = Object.keys(err.keyPattern);
      let duplicateKey = keys[0];
      response.error = "duplicate_" + duplicateKey;
      let duplicateValue = err.keyValue[duplicateKey];
      response.message = `${duplicateValue} 已经存在`;
    }

    return response;
  }

  return null;
}

const errorHandlers = [
  joiResponseErrorHandler,
  mongooseResponseValidationErrorHandler,
  mongooseErrorHandler,
  defaultResponseErrorHandler,
];

const constructErrorResponse = (err) => {
  var response;
  for (var handler in errorHandlers) {
    let handlerFn = errorHandlers[handler];
    if (typeof handlerFn === "function") {
      response = handlerFn(err);
      if (response !== null) break;
    }
  }
  return response;
};

module.exports = {
  constructErrorResponse,
  CommentReferenceError,
};
