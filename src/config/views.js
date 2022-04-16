/**
 * # views.js
 *
 * Snowflake has only one view, reset password
 *
 * Using the module 'vision, establish the renderering engine,
 * in this case, handlebars, and where the views are located
 *
 * Since this reset password view needs a javascript file,
 * the location of this 'asset' is set.
 *
 */
"use strict";

/**
 * ## Imports
 *
 */
// Hoek is similar to underscore
var Handlebars = require("handlebars"),
  Hoek = require("@hapi/hoek"),
  internals = {},
  Inert = require("@hapi/inert"),
  Marked = require("marked").marked,
  Pack = require("../../package"),
  Path = require("path"),
  Vision = require("@hapi/vision");

/**
 * ### markdown view
 *
 * Use the GitHub Markdown css
 */
function MarkdownView() {
  this.compile = function (template) {
    return function (context) {
      var html = Marked(template, context);
      return `<link rel="stylesheet" href="/assets/github-markdown.css">
<style>
    .markdown-body {
        box-sizing: border-box;
        min-width: 200px;
        max-width: 980px;
        margin: 0 auto;
        padding: 45px;
    }
</style>
<article class="markdown-body">
    ${html}
</article>`;
    };
  };
}

/**
 * ## init
 *
 */
internals.init = async function (server) {
  /**
   * ### vision
   *
   * this establishes where the html is located
   * and the engine to parse it
   */
  await server
    .register({
      plugin: Vision,
    })
    .then(() => {
      server.views({
        engines: {
          html: Handlebars,
          md: {
            module: new MarkdownView(),
            contentType: "text/html",
          },
        },
        relativeTo: __dirname,
        path: [Path.join(__dirname, "../views"), Path.join(__dirname, "../docs")],
      });
    })
    .catch((err) => {
      Hoek.assert(!err, err);
    });
  /**
   * ### inert
   *
   * this says that any request for /assest/* will
   * be served from the ../assests dir
   *
   * The resetpassword.js is located in ../assests
   *
   */
  await server
    .register({
      plugin: Inert,
    })
    .then(() => {
      //Load files located in ../assets
      server.route({
        method: "GET",
        path: "/assets/{param*}",
        handler: {
          directory: {
            path: Path.join(__dirname, "../assets"),
          },
        },
      });
    })
    .catch((err) => {
      //Confirm no err
      Hoek.assert(!err, err);
    });
};

module.exports = internals;
