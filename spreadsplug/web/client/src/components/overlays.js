/** @jsx React.DOM */
/* global module, require */

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
      Activity, LightBox, Progress;

  /**
   * Display an overlay with a CSS3 animation indicating ongoing activty.
   *
   * @property {string} message - Message to display below the activity
   *    animation
   */
  Activity = React.createClass({
    displayName: "ActivityOverlay",
    render: function() {
      return (
        <div className="overlay activity">
          <div className="animation">
            <div className="bounce"></div>
            <div className="bounce"></div>
          </div>
          <p className="text">{this.props.message}</p>
        </div>
      );
    }
  });

  /**
   * Display image in lightbox overlay.
   *
   * @property {function} onClose - Callback function for when the lightbox is closed.
   * @property {url} src - Source URL for the image to be displayed
   */
  LightBox = React.createClass({
    displayName: "LightBox",
    getInitialState: function() {
      return {};
    },
    handleResize: function(e) {
      console.debug(e);
      // TODO: Shouldn't this be possible just with CSS?
      var imgNode = this.refs.image.getDOMNode();
      this.setState({
          controlY: imgNode.offsetTop,
          controlHeight: imgNode.offsetHeight,
          previousX: imgNode.offsetLeft-80,
          nextX: imgNode.offsetLeft + imgNode.offsetWidth
      });
    },
    componentDidMount: function() {
      window.addEventListener("resize", this.handleResize);
    },
    componentWillUnmount: function() {
      window.removeEventListener("resize", this.handleResize);
    },
    render: function() {
      return (
        <div title="Close lightbox" onClick={this.props.onClose} className="overlay lightbox">
          <a data-bypass={true} title="Open full resolution image in new tab" className="open-image" href={this.props.src} target='_blank'>
            <img ref="image" className={this.props.targetPage || ''} src={this.props.src + '?format=browser'} onLoad={this.handleResize}/>
          </a>
          {(this.state.previousX !== undefined) && this.props.handlePrevious &&
            <a title="View previous page" className="control"
                style={{position: 'fixed',
                        left: this.state.previousX,
                        width: 80,
                        height: this.state.controlHeight,
                        'line-height': this.state.controlHeight,
                        top: this.state.controlY}}
                onClick={this.props.handlePrevious}>
              <i className="fa fa-caret-left fa-5x" />
            </a>
          }
          {(this.state.nextX !== undefined) && this.props.handleNext &&
            <a title="View next page" className="control"
                style={{position: 'fixed',
                        left: this.state.nextX,
                        width: 80,
                        height: this.state.controlHeight,
                        'line-height': this.state.controlHeight,
                        top: this.state.controlY}}
                onClick={this.props.handleNext}>
              <i className="fa fa-caret-right fa-5x" />
            </a>
          }
        </div>
      );
    }
  });

  Progress = React.createClass({
    displayName: "ProgressOverlay",
    render: function() {
      var widthPercent;
      if (this.props.progress > 1) widthPercent = this.props.progress | 0;
      else widthPercent = (this.props.progress*100) | 0;
      return (
        <div className="overlay spreads-progress">
          <div className="progress">
            <span className="meter" style={{width: widthPercent+"%"}}></span>
            <span className="status">{this.props.statusMessage}</span>
          </div>
        </div>
      );
    }
  });

  module.exports = {
      Activity: Activity,
      LightBox: LightBox,
      Progress: Progress
  }
}());
