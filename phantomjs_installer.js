/**
 * @file phantomjs_installer.js
 *
 * @description Main file for lambda-phantomjs-installer package, defines a class that
 *              allows you to install a pre-compiled version of phantomjs onto
 *              your system
 *              This package was original built to be run on AWS lambda, so that
 *              phantomjs can be installed and cached before running.
 *
 * Copyright (C) 2016 Dor Technologies
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE file for details.
 */

var child_process = require( 'child_process' ),
    fs = require( 'fs' ),
    path  = require( 'path' );

var q = require( 'q' ),
    _ = require( 'underscore' ),
    request = require( 'request' );

var DEFAULT_DOWNLOAD_URL = 'https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-linux-x86_64.tar.bz2';
var DEFAULT_INSTALL_DIR = '/tmp/libs/';
var DEFAULT_EXTRACT_DIRNAME = 'phantomjs_extracted';
var DEFAULT_RELATIVE_UNINSTALLED_EXE_PATH = 'bin/phantomjs';
var DEFAULT_EXE_NAME = 'phantomjs';
var DEFAULT_TAR_COMMAND = 'tar';
var DEFAULT_CP_COMMAND = '/bin/cp';
var DEFAULT_CHMOD_COMMAND = '/bin/chmod';

/**
 * Installer class for phantomjs_installer. Instantiate one of these and call the
 * .install() method to install phantomjs
 *
 * @param  {Object} options Specify options for the installer
 * @param  {String} options.download_url The download url for phantomjs, defaults
 *                                       to: 'https://bitbucket.org/ariya/phantomjs/downloads/phantomjs-2.1.1-linux-x86_64.tar.bz2'
 *                                       (Stolen from phantomjs-precompiled npm
 *                                       package)
 * @param  {String} options.install_dir The directory to install the phantomjs exe
 *                                      to, defaults to '/tmp/libs' (For aws lambda)
 * @param  {String} options.extract_dirname The downloaded tarbal is extracted to
 *                                          this directory. Defaults to
 *                                          'phantomjs_extracted'
 * @param  {String} options.relative_uninstalled_exe_path The relative path from
 *                                                        the root of the extracted
 *                                                        directory that the executable
 *                                                        can be found. Defaulted
 *                                                        to `bin/phantomjs` as
 *                                                        that is where it is found
 *                                                        in the default download
 * @param  {String} options.tar_command The command used for untaring. Default
 *                                      `tar`. See createUnzipProcess for how to
 *                                      replace the default arguments (if your tar
 *                                      is not a `.tar.bz2`)
 * @param  {String} options.cp_command The command used for copying. Default `/bin/cp`
 * @param  {String} options.chmod_command The command used for setting executable.
 *                                        Default `/bin/chmod`
 * @param  {String} options.exe_name The name for the final exe. The exe will be
 *                                   found at `path.join( options.install_dir,
 *                                   options.exe_name )`. Default `phantomjs`
 */
var Installer = function( options ) {
    this._options = _
        .defaults( options || {}, {
            download_url: DEFAULT_DOWNLOAD_URL,
            install_dir: DEFAULT_INSTALL_DIR,
            extract_dirname: DEFAULT_EXTRACT_DIRNAME,
            relative_uninstalled_exe_path: DEFAULT_RELATIVE_UNINSTALLED_EXE_PATH,
            tar_command: DEFAULT_TAR_COMMAND,
            cp_command: DEFAULT_CP_COMMAND,
            chmod_command: DEFAULT_CHMOD_COMMAND,
            exe_name: DEFAULT_EXE_NAME
        } );

    /**
     * Creates the ChildProcess for the unziping (untaring) installation step.
     * If you need custom arguments for your untar command (your download file is
     * not a .tar.bz2) then you should overwrite this method. Return a process that
     * was spawned with child_process.spawn, and it will be used by the _downloadAndExtract
     * method
     * @param  {String} extract_dir Where to put the extracted file
     * @return {ChildProcess}             NodeJs child process, see https://nodejs.org/docs/latest-v0.10.x/api/child_process.html
     */
    this.createUnzipProcess = function( extract_dir ) {
        var tar_command_arguments = [ '-C', extract_dir, '--strip-components', '1', '-xjf', '-' ];

        var untar_process = child_process.spawn( this._options.tar_command, tar_command_arguments );
        untar_process.stderr.pipe( process.stderr );

        return untar_process;
    };

    /**
     * Downloads and unzips the installation tarball
     * @return {Promise} Completed when download/untar process is complete
     */
    this._downloadAndExtract = function() {
        var _this = this;

        return q
            .Promise( function( resolve ) {
                // Setup the directories for the install and extraction
                if( !fs.existsSync( _this._options.install_dir ) ) fs.mkdirSync( '/tmp/libs' );
                var extract_dir = path.join( _this._options.install_dir, _this._options.extract_dirname );
                if( !fs.existsSync( extract_dir ) ) fs.mkdirSync( extract_dir );

                var untar_process = _this.createUnzipProcess( extract_dir );

                // Download the file
                request.get( _this._options.download_url ).pipe( untar_process.stdin );

                var full_uninstalled_exe_path = path.join( _this._options.install_dir, _this._options.extract_dirname, _this._options.relative_uninstalled_exe_path );

                untar_process
                    .on( 'close', function() {
                        resolve( full_uninstalled_exe_path );
                    } );
            } );
    };

    /**
     * Copys the exe from the downloaded/extracted path to the install location
     * See options.cp_command to change what command is run
     * @param  {String} full_installed_exe_path The path to copy the exe to
     * @return {Promise}                        Promise that accepts the uninstalled
     *                                                  exe path, and resolves
     *                                                  when the exe is copied
     */
    this._copy = function( full_installed_exe_path ) {
        var _this = this;

        return function( full_uninstalled_exe_path ) {
            return q
                .Promise( function( resolve ) {
                    console.log( _this._options.cp_command, [ full_uninstalled_exe_path, full_installed_exe_path ] );
                    var copy_process = child_process.execFile( _this._options.cp_command, [ full_uninstalled_exe_path, full_installed_exe_path ] );

                    copy_process
                        .on( 'close', function() {
                            resolve( full_installed_exe_path );
                        } );
                } );
        }
    }

    /**
     * Adds executable flag to the exe so that it can be executed by the system
     * See options.chmod_command to change what command is run
     * @return {Promise} Promise that accepts the full_installed_exe_path as a
     *                           String, and resolves when the chmod command has
     *                           been run.
     */
    this._chmod = function() {
        var _this = this;

        return function( full_installed_exe_path ) {
            return q
                .Promise( function( resolve ) {
                    console.log( _this._options.chmod_command, [ '+x', full_installed_exe_path ] );
                    var chmod_process = child_process.execFile( _this._options.chmod_command, [ '+x', full_installed_exe_path ] );

                    chmod_process
                        .on( 'close', function() {
                            resolve( full_installed_exe_path );
                        } );
                } );
        };
    }

    /**
     * The main install method for the installer. It attempts to find and installed
     * phantomjs before installing. It will look for `require( 'phantomjs' )` and
     * for a previously installed exe in `path.join( _this._options.install_dir,
     * _this._options.exe_name );` and return those if it can
     * @return {Promise} Return a promise that resolves with the installed path
     *                          once the installation is complete
     */
    this.install = function() {
        var _this = this;

        return q
            .Promise( function( resolve, reject ) {
                // If we have successfully installed phantomjs then don't worry about
                // installing it here. (On development environments we don't need to
                // install it again)
                try {
                    var phantomjs = require( 'phantomjs' );
                    return resolve( phantomjs.path );
                } catch( e ) {

                }

                var full_installed_exe_path = path.join( _this._options.install_dir, _this._options.exe_name );

                // If we have already installed it, we can returned the cached version
                if( fs.existsSync( full_installed_exe_path ) ) {
                    return resolve( full_installed_exe_path );
                }

                _this._downloadAndExtract()
                    .then( _this._copy( full_installed_exe_path ) )
                    .then( _this._chmod() )
                    .then( resolve )
                    .catch( reject );
            } );
    }
};

module.exports = Installer;
