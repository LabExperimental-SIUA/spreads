/** @jsx React.DOM */
/* global module, require, console */

/*
 * Copyright (C) 2014 Johannes Baiter <johannes.baiter@gmail.com>
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.

 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

(function() {
  'use strict';

  var React = require('react/addons'),
      _ = require('underscore'),
      Mousetrap = require('mousetrap'),
      foundation = require('./foundation.js'),
      ModelMixin = require('../../vendor/backbonemixin.js'),
      LoadingOverlay = require('./overlays.js').Activity,
      lightbox = require('./overlays.js').LightBox,
      PluginWidget = require('./config.js').PluginWidget,
      CropWidget = require('./cropdialog.js'),
      util = require('../util.js'),
      row = foundation.row,
      column = foundation.column,
      fnButton = foundation.button,
      confirmModal = foundation.confirmModal,
      modal = foundation.modal,
      placeholderImg;

  placeholderImg = "data:image/png;base64, iVBORw0KGgoAAAANSUhEUgAAAKAAAAB4AQMAAABPbGssAAAAA1BMVEWZmZl86KQWAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH3gQIFjciiRhnwgAAABl0RVh0Q29tbWVudABDcmVhdGVkIHdpdGggR0lNUFeBDhcAAAAZSURBVEjH7cEBDQAAAMKg909tDwcUAAAPBgnYAAHW6F1SAAAAAElFTkSuQmCC";


  /**
   * Screen component to control the capture process.
   *
   * @property {Workflow} workflow - Workflow to control capture on
   */
  module.exports = React.createClass({
    displayName: "CaptureScreen",

    /** Enables two-way databinding with Backbone model */
    mixins: [ModelMixin],

    /** Activates databinding for `workflow` model property. */
    getBackboneModels: function() {
      return [this.props.workflow];
    },
    getInitialState: function() {
      // Try to load cropParams for this workflow from localStorage
      return {
        /** Display activity overlay? */
        waiting: false,
        /** Initial number of pages shot */
        initialPageCount: this.props.workflow.get('pages').length,
        /** Message for activity overlay */
        waitMessage: undefined,
        /** Time of first capture */
        captureStart: undefined,
        /** Validation errors for device configuration */
        validationErrors: {},
        /** Crop parameters */
        cropParams: {},
        /** Whether we registered a function to crop on successful captures */
        cropOnSuccess: false,
      };
    },
    /**
     * Triggers preparation of capture on workflow and displays the activity
     * overlay until the process is finished.
     */
    componentWillMount: function() {
      this.toggleWaiting("Please wait while the devices  are being prepared " +
                          "for capture");
      this.props.workflow.on('capture-triggered', function(){
        this.toggleWaiting("Please wait for the capture to finish...");
      }, this);
      this.props.workflow.on('capture-succeeded', this.toggleWaiting, this);
      this.props.workflow.on('status-updated', function(status) {
        if (status.step !== 'capture') this.handleFinish();
      }, this);
      // Finish workflow before closing the window
      window.addEventListener("beforeunload", this.handleUnload);
      _.each(window.config.core.capture_keys, function(key) {
        if (key === ' ') key = 'space';
        Mousetrap.bind(key, this.handleCapture);
      }, this);
      Mousetrap.bind('r', this.handleRetake);
      Mousetrap.bind('f', this.handleFinish);
      this.props.workflow.prepareCapture(this.toggleWaiting);
    },
    componentDidMount: function() {
      var storageKey = 'crop-params.' + this.props.workflow.id,
          cropParamJson = localStorage.getItem(storageKey),
          cropParams;
      if (!cropParamJson) return;
      // If there are crop parameters in the localStorage for this scan,
      // the pages preceding the first shot are (likely, TODO) already cropped,
      // so we only register the crop callback after the first capture has
      // already happened.
      this.props.workflow.once('capture-succeeded', this.bindCropEvents, this);
      this.setState({
        cropParams: JSON.parse(cropParamJson),
        cropTarget: undefined
      });
    },
    /**
     * Triggers finish of capture on workflow.
     */
    componentWillUnmount: function() {
      console.log("Wrapping up capture process");

      // Remove event listeners
      this.props.workflow.off(null, null, this);
      _.each(window.config.core.capture_key, function(key) {
        if (key === ' ') key = 'space';
        Mousetrap.unbind(key);
      });
      Mousetrap.unbind('r');
      Mousetrap.unbind('f');
      window.removeEventListener("beforeunload", this.handleUnload);

      // Crop last two shot images
      if (!_.isEmpty(this.state.cropParams)) {
        _.each(this.props.workflow.get('pages').slice(-2), function(page) {
            var targetPage = page.sequence_num%2 > 0 ? 'odd': 'even';
            this.props.workflow.cropPage(page.sequence_num, this.state.cropParams[targetPage]);
        }, this);
      }
      this.props.workflow.finishCapture();
    },
    handleUnload: function(event) {
      this.props.workflow.finishCapture();
    },
    /**
     * Trigger a single capture, display activity overlay until it is finished
     */
    handleCapture: function() {
      if (this.state.waiting) {
        // There is already a capture (or preparation) in progress.
        return;
      }
      console.log("Triggering capture");
      this.props.workflow.triggerCapture(false, function() {
        if (this.state.refreshReview) {
          this.setState({refreshReview: false});
        }
      }.bind(this));
    },
    /**
     * For each page number 'n' in data.pages, crop the page 'n-2' with
     * the appropriate crop parameters.
     */
    cropLast: function(data) {
      var workflow = this.props.workflow,
          shotPages = data.pages;
      if (data.retake) {
        // Don't crop on retakes
        return;
      }
      console.log("Cropping last capture");
      _.each(shotPages, function(page) {
        var pageNum = page.sequence_num,
            toCrop = pageNum-2,
            targetPage = pageNum%2 > 0 ? 'odd': 'even';
        this.props.workflow.cropPage(toCrop, this.state.cropParams[targetPage]);
      }, this);
    },
    /**
     * Trigger a retake (= delete last <num_devices> captures and take new
     * ones, display activity overlay until it is finished.
     */
    handleRetake: function() {
      if (this.state.waiting) {
        // There is already a capture (or preparation) in progress.
        return;
      }
      console.log("Re-taking last shot");
      this.props.workflow.triggerCapture(true, function() {
        if (!this.state.refreshReview) {
          this.setState({refreshReview: true});
        }
      }.bind(this));
    },
    /**
     * Finish capture and navigate back to workflow list screen
     */
    handleFinish: function() {
      window.router.navigate('/', {trigger: true});
    },
    /**
     * Toggle display of activity overlay.
     *
     * @param {string} message - Message to display on overlay
     */
    toggleWaiting: function(message) {
      if (!this.state.waiting) {
        this.setState({
          waiting: true,
          waitMessage: message || ''
        });
      } else {
        this.setState({waiting: false});
      }
    },
    toggleConfigModal: function() {
      this.setState({
        displayConfig: !this.state.displayConfig
      });
    },
    toggleCropDialog: function(targetPage) {
      this.setState({
        cropTarget: targetPage
      });
    },
    bindCropEvents: function() {
      if (!this.state.cropOnSuccess) {
        this.props.workflow.on('capture-succeeded', this.cropLast, this);
        this.setState({cropOnSuccess: true})
      }
    },
    setCropParams: function(params) {
      // Register event to crop the previous picture for any new picture taken
      // We don't send this manually with each capture trigger, since we also
      // want to catch captures triggered from the backend (i.e. via the
      // hidtrigger plugin)
      var origParams = this.state.cropParams,
          storageKey = 'crop-params.' + this.props.workflow.id,
          paramJson;
      this.bindCropEvents();
      origParams[this.state.cropTarget] = params;
      paramJson = JSON.stringify(origParams);
      if (paramJson != localStorage.getItem(storageKey)) {
        localStorage.setItem(storageKey, paramJson);
      }
      this.setState({
        cropParams: origParams,
        cropTarget: undefined
      });
    },
    saveConfig: function() {
      this.props.workflow.on('validated:invalid', function(workflow, errors) {
        this.setState({validationErrors: errors});
      }, this);
      var xhr = this.props.workflow.save();
      if (xhr) {
        xhr.done(function() {
          this.toggleConfigModal();
          this.toggleWaiting("Configuring cameras.")
          this.props.workflow.prepareCapture(this.toggleWaiting, true);
          this.props.workflow.off('validated:invalid', null, this);
        }.bind(this))
      };
    },
   /**
     * Open image in lightbox overlay
     *
     * @param {url} - Image to display in lightbox
     */
    openLightbox: function(img, targetPage) {
      this.setState({
        lightboxImage: img,
        lightboxImageTarget: targetPage
      });
    },
    /**
     * Close the lightbox overlay.
     */
    closeLightbox: function() {
      this.setState({
        lightboxImage: undefined,
        lightboxImageTarget: undefined,
        refreshReview: false,
      });
    },
    toggleAdvanced: function(){
      this.setState({ advancedOpts: !this.state.advancedOpts });
      this.forceUpdate();
    },
    getCropPreviewStyle: function(targetPage) {
      var cropParams = this.state.cropParams[targetPage],
          thumbNode = this.refs['thumb-'+targetPage].getDOMNode(),
          factor = thumbNode.offsetWidth / cropParams.nativeWidth,
          thumbOffset = thumbNode.offsetLeft;
      return {
        left: thumbOffset + Math.ceil(cropParams.left*factor),
        top: Math.ceil(cropParams.top*factor),
        width: Math.ceil(cropParams.width*factor),
        height: Math.ceil(cropParams.height*factor)
      };
    },
    render: function() {
      var workflow = this.props.workflow || {},
          randomSuffix = this.state.refreshReview ? '?'+(Math.random()*10e3 | 0) : '',
          speed, oddImage, evenImage, captureKeys, previewClasses;

      previewClasses = {
        'capture-preview': true,
        'small-block-grid-2': util.getOrientation() === 'landscape',
        'small-block-grid-1': util.getOrientation() === 'portrait',
        'medium-block-grid-2': util.getOrientation() === 'portrait'
      }
      captureKeys = [] ;
      _.each(window.config.core.capture_keys, function(key) {
        if (key === ' ') captureKeys.push('<spacebar>');
        else captureKeys.push(key);
      });
      if (workflow && this.state.captureStart) {
        var elapsed = (new Date().getTime()/1000) - this.state.captureStart,
            shot = workflow.get('pages').length - this.state.initialPageCount;
        speed = (3600/elapsed)*shot | 0;
      } else {
        this.setState({captureStart: new Date().getTime()/1000});
        speed = 0.0;
      }
      if (workflow.get('pages').length) {
        var lastPages = _.sortBy(workflow.get('pages').slice(-2), function(page) {
          return page.sequence_num;
        });
        evenImage = util.getPageUrl(workflow, lastPages[0], 'raw');
        oddImage = util.getPageUrl(workflow, lastPages[1], 'raw');
      }
      return (
        <div>
          {/* Display loading overlay? */}
          {this.state.waiting && <LoadingOverlay message={this.state.waitMessage} />}
          {/* Display lightbox overlay? */}
          {this.state.lightboxImage &&
            <lightbox onClose={this.closeLightbox} src={this.state.lightboxImage}
                      targetPage={this.state.lightboxImageTarget} />}
          {this.state.displayConfig &&
            <form onSubmit={this.saveConfig}>
              <confirmModal onCancel={this.toggleConfigModal} onConfirm={this.saveConfig}>
                <h2>Configure Devices</h2>
                <input id="check-advanced" type="checkbox" value={this.state.advancedOpts}
                       onChange={this.toggleAdvanced} />
                <label htmlFor="check-advanced">Show advanced options</label>
                <PluginWidget plugin="device" template={window.pluginTemplates.device}
                              showAdvanced={this.state.advancedOpts}
                              bindFunc={function(key) {
                                return this.bindTo(this.props.workflow,
                                                    'config.device.' + key);
                              }.bind(this)} errors={[]} />
              </confirmModal>
            </form>
          }
          {this.state.cropTarget &&
            <modal onClose={function(){this.setState({cropTarget: undefined});}.bind(this)}
                   small={false}>
              <CropWidget imageSrc={this.state.cropTarget == 'even' ? evenImage : oddImage}
                          onSave={this.setCropParams}
                          cropParams={this.state.cropParams[this.state.cropTarget]}
                          showInputs={true}/>
            </modal>
          }
          <row>
            <column>
              {/* NOTE: We append a random suffix to the thumbnail URL to force
                *       the browser to load from the server and not from the cache.
                *       This is needed since the images might change on the server,
                *       e.g. after a retake. */}
              <ul className={React.addons.classSet(previewClasses)}>
                <li>
                  {evenImage && <a className="toggle-crop" title="Crop image" onClick={function(){this.toggleCropDialog('even');}.bind(this)}><i className="fa fa-crop" /> Crop</a>}
                  {evenImage ?
                    <a title="Open full resolution image in lightbox" onClick={function(){this.openLightbox(evenImage+'?'+randomSuffix, 'even');}.bind(this)}>
                      <img className="even" src={evenImage+"/thumb?"+randomSuffix} ref="thumb-even"/>
                    </a>:
                    <img className="placeholder even" src={placeholderImg}/>}
                  {this.isMounted() && this.state.cropOnSuccess && this.state.cropParams.even &&
                      <div className="crop-preview" style={this.getCropPreviewStyle('even')}/>
                  }
                </li>
                <li>
                  {oddImage && <a className="toggle-crop" title="Crop image" onClick={function(){this.toggleCropDialog('odd');}.bind(this)}><i className="fa fa-crop" /> Crop</a>}
                  {oddImage ?
                  <a title="Open full resolution image in lightbox" onClick={function(){this.openLightbox(oddImage+'?'+randomSuffix, 'odd');}.bind(this)}>
                    <img className="odd" src={oddImage+"/thumb?"+randomSuffix} ref="thumb-odd"/>
                  </a>:
                  <img className="placeholder odd" src={placeholderImg}/>}
                  {this.isMounted() && this.state.cropOnSuccess && this.state.cropParams.odd &&
                    <div className="crop-preview" style={this.getCropPreviewStyle('odd')}/>
                  }
                </li>
              </ul>
            </column>
          </row>
          <row className="capture-info">
            <column size="6">
              <span className="pagecount">{workflow.get('pages').length} pages</span>
            </column>
            {speed > 0 &&
            <column size="6">
              <span className="capturespeed">{speed} pages/hour</span>
            </column>}
          </row>
          <row>
            <div className="small-12 capture-controls columns">
              <ul>
                <li id="retake-capture">
                  <fnButton title="Discard last capture and take a new one"
                            callback={this.handleRetake} secondary='true'>
                      <i className="fa fa-refresh"></i>
                  </fnButton>
                </li>
                <li id="trigger-capture">
                  <fnButton title="Trigger capture"
                            callback={this.handleCapture}>
                    <i className="fa fa-camera"></i>
                  </fnButton>
                </li>
                <li>
                  <fnButton title="Configure devices"
                            callback={this.toggleConfigModal} secondary='true'>
                    <i className="fa fa-gear"></i>
                  </fnButton>
                </li>
                <li>
                  <fnButton title="Finish capture and return to workflow list"
                            callback={this.handleFinish} complete={true}>
                    <i className="fa fa-check"></i>
                  </fnButton>
                </li>
              </ul>
            </div>
          </row>
          {!util.isTouchDevice() &&
          <row className="hide-for-touch">
            <column size="4" offset="4" className="shortcuts">
              <strong>Keyboard shortcuts:</strong>
              <ul>
                <li>Capture:
                  {_.map(captureKeys, function(key) {
                    return (<span key={key}>{' '}<kbd>{key.toUpperCase()}</kbd></span>);
                  })}</li>
                <li>Retake: <kbd>R</kbd></li>
                <li>Finish: <kbd>F</kbd></li>
              </ul>
            </column>
          </row>}
        </div>
      );
    }
  });
})();
