/**
 * Copyright (c) 2013, Facebook, Inc. All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 * 
 *  * Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 * 
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 * 
 *  * Neither the name Facebook nor the names of its contributors may be used to
 *    endorse or promote products derived from this software without specific
 *    prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * This is the runtime that gets executed in the context of the inspected page.
 * It is the glue that hooks into the React runtime and translates it into
 * something that the inspector can use.
 */

(function() {

// Detect React environment

var ReactInternals;
if (typeof React !== 'undefined' && React.__internals) {
  ReactInternals = React.__internals;
} else if (typeof require === 'function') {
  try { ReactInternals = require('React').__internals; } catch (x) {
    try { ReactInternals = require('react').__internals; } catch (x) {
      try { ReactInternals = require('/react').__internals; } catch (x) { }
    }
 }
}
if (!ReactInternals) {
  throw new Error('Unsupported environment. You need version 0.5+ of React.');
}

// Monkey patched to track updates
var ReactComponent = ReactInternals.Component;
// Track which component the current breakpoint is in
var ReactCurrentOwner = ReactInternals.CurrentOwner;
// Get top level instances and extract IDs from real DOM nodes
var ReactMount = ReactInternals.Mount;
// Use instanceof check to see if this is plain text (can't duck check)
var ReactTextComponent = ReactInternals.TextComponent;
// Used to see if one instance is the ancestor of an instance or dom node
var ReactInstanceHandles = ReactInternals.InstanceHandles;

// Monkey patch Components to track rerenders

var ComponentMixin = ReactComponent.Mixin;
var originalMountComponent = ComponentMixin.mountComponent;
var originalUpdateComponent = ComponentMixin.updateComponent;
var originalUnmountComponent = ComponentMixin.unmountComponent;

ComponentMixin.mountComponent = function() {
  originalMountComponent.apply(this, arguments);
  ReactHost._changeSubscriber.componentWillMount(this);
};

ComponentMixin.updateComponent = function() {
  originalUpdateComponent.apply(this, arguments);
  ReactHost._changeSubscriber.componentWillUpdate(this);
};

ComponentMixin.unmountComponent = function() {
  originalUnmountComponent.apply(this, arguments);
  ReactHost._changeSubscriber.componentWillUnmount(this);
};

// React Host API

var ReactHost = {

  _changeSubscriber: null,

  instancesByRootID: ReactMount._instancesByReactRootID,

  subscribeToChanges: function(subscriber) {
    this._changeSubscriber = subscriber;
  },

  isTextComponent: function(component) {
    if (!ReactTextComponent) return false;
    return component instanceof ReactTextComponent;
  },

  _unwrapMethod: function(method, targetEventName) {
    var context = method.__reactBoundContext;
    var originalMethod = method.__reactBoundMethod;
    if (!originalMethod || !context) {
      return {
        name: targetEventName,
        handler: method
      };
    }
    for (var autoBindKey in context.__reactAutoBindMap) {
      if (!context.__reactAutoBindMap.hasOwnProperty(autoBindKey)) {
        continue;
      }
      var method = context.__reactAutoBindMap[autoBindKey];
      if (method === originalMethod) {
        return {
          name: targetEventName,
          handler: originalMethod,
          owner: context,
          methodName: autoBindKey
        };
      }
    }
    return {
      name: targetEventName,
      handler: originalMethod
    };
  },

  getEventListeners: function(instance) {
    if (!instance || !instance.props) return [];
    var props = instance.props;
    var listeners = [];
    for (var key in props) {
      var listener = props[key];
      if (typeof listener === 'function') {
        listeners.push(ReactHost._unwrapMethod(listener, key));
      }
    }
    return listeners;
  },

  isInstance: function(instance, instanceOrNode) {
    if (instance === instanceOrNode) return true;
    if (!ReactMount.isRenderedByReact(instanceOrNode)) return false;
    var nodeID = ReactMount.getID(instanceOrNode);
    return nodeID === instance._rootNodeID && !instance._renderedComponent;
  },

  isAncestorOf: function(ancestor, descendant) {
    var ancestorID = ancestor._rootNodeID;
    var descendantID = descendant._rootNodeID || ReactMount.getID(descendant);
    return ReactInstanceHandles.isAncestorIDOf(ancestorID, descendantID);
  },

  hasTextContent: function(component) {
    // Return true if this is a native component with text content
    return (
      component.tagName &&
      component.props && (
        typeof component.props.children === 'string' ||
        typeof component.props.children === 'number'
      )
    );
  },

  getCurrentlyRenderingComponent: function() {
    return ReactCurrentOwner.current;
  }

};

return ReactHost;

})
