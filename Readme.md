# Lambda PhantomJS Installer

## Description / Motivation

This package was created so that PhantomJS can easily be used on AWS Lambda.
Due to code size limits on AWS Lambda, it is not always possible to package
the preinstalled PhantomJS executable with your code. This package remedies
that by allowing you to install PhantomJS from within your AWS Lambda function's
code.

## Installation

```bash
npm install --save lambda-phantomjs-installer
```

*Make sure that you include lambda-phantomjs-installer in the zipfile you upload
to AWS lambda so that your AWS Lambda function can find the package*

## Usage

```javascript
var PhantomJSInstaller = require( 'lambda-phantomjs-installer' );

var phantomjs_installer = new PhantomJSInstaller();

exports.handler = function( event, context ) {
    phantomjs_installer
        .install()
        .then( function( phantomjs_path ) {
            console.log( 'PhantomJS Installed at ' + phantomjs_path );
            context.done();
        } )
        .catch( function( err ) {
            context.done( err );
        } );
};
```

See phantomjs_installer.js for more information about options that can be passed
to the installer
