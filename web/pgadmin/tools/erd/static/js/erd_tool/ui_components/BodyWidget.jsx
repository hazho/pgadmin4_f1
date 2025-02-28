/////////////////////////////////////////////////////////////
//
// pgAdmin 4 - PostgreSQL Tools
//
// Copyright (C) 2013 - 2022, The pgAdmin Development Team
// This software is released under the PostgreSQL Licence
//
//////////////////////////////////////////////////////////////

import * as React from 'react';
import { CanvasWidget, Action, InputType } from '@projectstorm/react-canvas-core';
import axios from 'axios';
import PropTypes from 'prop-types';
import _ from 'lodash';
import html2canvas from 'html2canvas';

import ERDCore from '../ERDCore';
import ToolBar, {IconButton, DetailsToggleButton, ButtonGroup} from './ToolBar';
import ConnectionBar, { STATUS as CONNECT_STATUS } from './ConnectionBar';
import Loader from './Loader';
import FloatingNote from './FloatingNote';
import {setPanelTitle} from '../../erd_module';
import gettext from 'sources/gettext';
import url_for from 'sources/url_for';
import {showERDSqlTool} from 'tools/sqleditor/static/js/show_query_tool';
import 'wcdocker';
import Theme from '../../../../../../static/js/Theme';
import TableSchema from '../../../../../../browser/server_groups/servers/databases/schemas/tables/static/js/table.ui';
import Notify from '../../../../../../static/js/helpers/Notifier';

/* Custom react-diagram action for keyboard events */
export class KeyboardShortcutAction extends Action {
  constructor(shortcut_handlers=[]) {
    super({
      type: InputType.KEY_DOWN,
      fire: ({ event })=>{
        this.callHandler(event);
      },
    });
    this.shortcuts = {};

    for(let shortcut_val of shortcut_handlers){
      let [key, handler] = shortcut_val;
      if(key) {
        this.shortcuts[this.shortcutKey(key.alt, key.control, key.shift, false, key.key.key_code)] = handler;
      }
    }
  }

  shortcutKey(altKey, ctrlKey, shiftKey, metaKey, keyCode) {
    return `${altKey}:${ctrlKey}:${shiftKey}:${metaKey}:${keyCode}`;
  }

  callHandler(event) {
    let handler = this.shortcuts[this.shortcutKey(event.altKey, event.ctrlKey, event.shiftKey, event.metaKey, event.keyCode)];
    if(handler) {
      handler();
    }
  }
}

/* The main body container for the ERD */
export default class BodyWidget extends React.Component {
  constructor() {
    super();
    this.state = {
      conn_status: CONNECT_STATUS.DISCONNECTED,
      server_version: null,
      any_item_selected: false,
      single_node_selected: false,
      single_link_selected: false,
      coll_types: [],
      loading_msg: null,
      note_open: false,
      note_node: null,
      current_file: null,
      dirty: false,
      show_details: true,
      is_new_tab: false,
      preferences: {},
      table_dialog_open: true,
      oto_dialog_open: true,
      otm_dialog_open: true,
    };
    this.diagram = new ERDCore();
    /* Flag for checking if user has opted for save before close */
    this.closeOnSave = React.createRef();
    this.fileInputRef = React.createRef();
    this.diagramContainerRef = React.createRef();
    this.canvasEle = null;
    this.noteRefEle = null;
    this.noteNode = null;
    this.keyboardActionObj = null;

    _.bindAll(this, ['onLoadDiagram', 'onSaveDiagram', 'onSaveAsDiagram', 'onSQLClick',
      'onImageClick', 'onAddNewNode', 'onEditTable', 'onCloneNode', 'onDeleteNode', 'onNoteClick',
      'onNoteClose', 'onOneToManyClick', 'onManyToManyClick', 'onAutoDistribute', 'onDetailsToggle',
      'onDetailsToggle', 'onHelpClick', 'onDropNode',
    ]);

    this.diagram.zoomToFit = this.diagram.zoomToFit.bind(this.diagram);
    this.diagram.zoomIn = this.diagram.zoomIn.bind(this.diagram);
    this.diagram.zoomOut = this.diagram.zoomOut.bind(this.diagram);
  }

  registerModelEvents() {
    let diagramEvents = {
      'offsetUpdated': (event)=>{
        this.realignGrid({backgroundPosition: `${event.offsetX}px ${event.offsetY}px`});
        event.stopPropagation();
      },
      'zoomUpdated': (event)=>{
        let { gridSize } = this.diagram.getModel().getOptions();
        let bgSize = gridSize*event.zoom/100;
        this.realignGrid({backgroundSize: `${bgSize*3}px ${bgSize*3}px`});
      },
      'nodesSelectionChanged': ()=>{
        let singleNodeSelected = false;
        if(this.diagram.getSelectedNodes().length == 1) {
          let metadata = this.diagram.getSelectedNodes()[0].getMetadata();
          if(!metadata.is_promise) {
            singleNodeSelected = true;
          }
        }
        this.setState({
          single_node_selected: singleNodeSelected,
          any_item_selected: this.diagram.getSelectedNodes().length > 0 || this.diagram.getSelectedLinks().length > 0,
        });
      },
      'linksSelectionChanged': ()=>{
        this.setState({
          single_link_selected: this.diagram.getSelectedLinks().length == 1,
          any_item_selected: this.diagram.getSelectedNodes().length > 0 || this.diagram.getSelectedLinks().length > 0,
        });
      },
      'linksUpdated': () => {
        this.setState({dirty: true});
      },
      'nodesUpdated': ()=>{
        this.setState({dirty: true});
      },
      'showNote': (event)=>{
        this.showNote(event.node);
      },
      'editTable': (event) => {
        this.addEditTable(event.node);
      },
    };
    Object.keys(diagramEvents).forEach(eventName => {
      this.diagram.registerModelEvent(eventName, diagramEvents[eventName]);
    });
  }

  registerKeyboardShortcuts() {
    /* First deregister to avoid double events */
    this.keyboardActionObj && this.diagram.deregisterKeyAction(this.keyboardActionObj);

    this.keyboardActionObj = new KeyboardShortcutAction([
      [this.state.preferences.open_project, this.onLoadDiagram],
      [this.state.preferences.save_project, this.onSaveDiagram],
      [this.state.preferences.save_project_as, this.onSaveAsDiagram],
      [this.state.preferences.generate_sql, this.onSQLClick],
      [this.state.preferences.download_image, this.onImageClick],
      [this.state.preferences.add_table, this.onAddNewNode],
      [this.state.preferences.edit_table, this.onEditTable],
      [this.state.preferences.clone_table, this.onCloneNode],
      [this.state.preferences.drop_table, this.onDeleteNode],
      [this.state.preferences.add_edit_note, this.onNoteClick],
      [this.state.preferences.one_to_many, this.onOneToManyClick],
      [this.state.preferences.many_to_many, this.onManyToManyClick],
      [this.state.preferences.auto_align, this.onAutoDistribute],
      [this.state.preferences.show_details, this.onDetailsToggle],
      [this.state.preferences.zoom_to_fit, this.diagram.zoomToFit],
      [this.state.preferences.zoom_in, this.diagram.zoomIn],
      [this.state.preferences.zoom_out, this.diagram.zoomOut],
    ]);

    this.diagram.registerKeyAction(this.keyboardActionObj);
  }

  handleAxiosCatch(err) {
    if (err.response) {
      // client received an error response (5xx, 4xx)
      Notify.alert(
        gettext('Error'),
        `${err.response.statusText} - ${err.response.data.errormsg}`
      );
      console.error('response error', err.response);
    } else if (err.request) {
      // client never received a response, or request never left
      Notify.alert(gettext('Error'), gettext('Client error') + ':' + err);
      console.error('client eror', err);
    } else {
      Notify.alert(gettext('Error'), err.message);
      console.error('other error', err);
    }
  }

  async componentDidMount() {
    this.setLoading(gettext('Preparing...'));

    this.setState({
      preferences: this.props.pgWindow.pgAdmin.Browser.get_preferences_for_module('erd'),
      is_new_tab: (this.props.pgWindow.pgAdmin.Browser.get_preferences_for_module('browser').new_browser_tab_open || '')
        .includes('erd_tool'),
    }, ()=>{
      this.registerKeyboardShortcuts();
      this.setTitle(this.state.current_file);
    });
    this.registerModelEvents();
    this.realignGrid({
      backgroundSize: '45px 45px',
      backgroundPosition: '0px 0px',
    });

    this.props.pgAdmin.Browser.Events.on('pgadmin-storage:finish_btn:select_file', this.openFile, this);
    this.props.pgAdmin.Browser.Events.on('pgadmin-storage:finish_btn:create_file', this.saveFile, this);
    this.props.pgAdmin.Browser.onPreferencesChange('erd', () => {
      this.setState({
        preferences: this.props.pgWindow.pgAdmin.Browser.get_preferences_for_module('erd'),
      }, ()=>this.registerKeyboardShortcuts());
    });

    this.props.panel?.on(window.wcDocker?.EVENT.CLOSING, () => {
      if(this.state.dirty) {
        this.closeOnSave = false;
        this.confirmBeforeClose();
        return false;
      }
      return true;
    });

    let done = await this.initConnection();
    if(!done) return;

    done = await this.loadPrequisiteData();
    if(!done) return;

    if(this.props.params.gen) {
      await this.loadTablesData();
    }

    window.addEventListener('beforeunload', this.onBeforeUnload.bind(this));
  }

  componentWillUnmount() {
    window.removeEventListener('beforeunload', this.onBeforeUnload.bind(this));
  }

  componentDidUpdate() {
    if(this.state.dirty) {
      this.setTitle(this.state.current_file, true);
    }
  }

  confirmBeforeClose() {
    let bodyObj = this;
    this.props.alertify.confirmSave || this.props.alertify.dialog('confirmSave', function() {
      return {
        main: function(title, message) {
          this.setHeader(title);
          this.setContent(message);
        },
        setup: function() {
          return {
            buttons: [{
              text: gettext('Cancel'),
              key: 27, // ESC
              invokeOnClose: true,
              className: 'btn btn-secondary fa fa-lg fa-times pg-alertify-button',
            }, {
              text: gettext('Don\'t save'),
              className: 'btn btn-secondary fa fa-lg fa-trash-alt pg-alertify-button',
            }, {
              text: gettext('Save'),
              className: 'btn btn-primary fa fa-lg fa-save pg-alertify-button',
            }],
            focus: {
              element: 0,
              select: false,
            },
            options: {
              maximizable: false,
              resizable: false,
            },
          };
        },
        callback: function(closeEvent) {
          switch (closeEvent.index) {
          case 0: // Cancel
            //Do nothing.
            break;
          case 1: // Don't Save
            bodyObj.closePanel();
            break;
          case 2: //Save
            bodyObj.onSaveDiagram(false, true);
            break;
          }
        },
      };
    });
    this.props.alertify.confirmSave(gettext('Save changes?'), gettext('The diagram has changed. Do you want to save changes?'));
    return false;
  }

  closePanel() {
    window.onbeforeunload = null;
    this.props.panel.off(window.wcDocker.EVENT.CLOSING);
    this.props.pgWindow.pgAdmin.Browser.docker.removePanel(this.props.panel);
  }

  getDialog(dialogName) {
    let serverInfo = {
      type: this.props.params.server_type,
      version: this.state.server_version,
    };
    if(dialogName === 'table_dialog') {
      return (title, attributes, isNew, callback)=>{
        this.props.getDialog(dialogName).show(
          title, attributes, isNew, this.diagram.getModel().getNodesDict(), this.diagram.getCache('colTypes'), this.diagram.getCache('schemas'), serverInfo, callback
        );
      };
    } else if(dialogName === 'onetomany_dialog' || dialogName === 'manytomany_dialog') {
      return (title, attributes, callback)=>{
        this.props.getDialog(dialogName).show(
          title, attributes, this.diagram.getModel().getNodesDict(), serverInfo, callback
        );
      };
    }
  }

  setLoading(message) {
    this.setState({loading_msg: message});
  }

  realignGrid({backgroundSize, backgroundPosition}) {
    if(backgroundSize) {
      this.canvasEle.style.backgroundSize = backgroundSize;
    }
    if(backgroundPosition) {
      this.canvasEle.style.backgroundPosition = backgroundPosition;
    }
  }

  addEditTable(node) {
    let dialog = this.getDialog('table_dialog');
    if(node) {
      let [schema, table] = node.getSchemaTableName();
      let oldData = node.getData();
      dialog(gettext('Table: %s (%s)', _.escape(table),_.escape(schema)), oldData, false, (newData)=>{
        if(this.diagram.anyDuplicateNodeName(newData, oldData)) {
          return gettext('Table name already exists');
        }
        node.setData(newData);
        this.diagram.syncTableLinks(node, oldData);
        this.diagram.repaint();
      });
    } else {
      dialog(gettext('New table'), {}, true, (newData)=>{
        if(this.diagram.anyDuplicateNodeName(newData)) {
          return gettext('Table name already exists');
        }
        let newNode = this.diagram.addNode(newData);
        this.diagram.syncTableLinks(newNode);
        newNode.setSelected(true);
      });
    }
  }

  onBeforeUnload(e) {
    if(this.state.dirty) {
      e.preventDefault();
      e.returnValue = 'prevent';
    } else {
      delete e['returnValue'];
    }
  }

  onDropNode(e) {
    let nodeDropData = JSON.parse(e.dataTransfer.getData('text'));
    if(nodeDropData.objUrl && nodeDropData.nodeType === 'table') {
      let matchUrl = `/${this.props.params.sgid}/${this.props.params.sid}/${this.props.params.did}/`;
      if(nodeDropData.objUrl.indexOf(matchUrl) == -1) {
        Notify.error(gettext('Cannot drop table from outside of the current database.'));
      } else {
        let dataPromise = new Promise((resolve, reject)=>{
          axios.get(nodeDropData.objUrl)
            .then((res)=>{
              resolve(this.diagram.cloneTableData(TableSchema.getErdSupportedData(res.data)));
            })
            .catch((err)=>{
              console.error(err);
              reject();
            });
        });
        const {x, y} = this.diagram.getEngine().getRelativeMousePoint(e);
        this.diagram.addNode(dataPromise, [x, y]).setSelected(true);
      }
    }
  }

  onEditTable() {
    const selected = this.diagram.getSelectedNodes();
    if(selected.length == 1) {
      this.addEditTable(selected[0]);
    }
  }

  onAddNewNode() {
    this.addEditTable();
  }

  onCloneNode() {
    const selected = this.diagram.getSelectedNodes();
    if(selected.length == 1) {
      let newData = this.diagram.cloneTableData(selected[0].getData(), this.diagram.getNextTableName());
      if(newData) {
        let {x, y} = selected[0].getPosition();
        let newNode = this.diagram.addNode(newData, [x+20, y+20]);
        newNode.setSelected(true);
      }
    }
  }

  onDeleteNode() {
    Notify.confirm(
      gettext('Delete ?'),
      gettext('You have selected %s tables and %s links.', this.diagram.getSelectedNodes().length, this.diagram.getSelectedLinks().length)
        + '<br />' + gettext('Are you sure you want to delete ?'),
      () => {
        this.diagram.getSelectedNodes().forEach((node)=>{
          this.diagram.removeNode(node);
        });
        this.diagram.getSelectedLinks().forEach((link)=>{
          this.diagram.removeOneToManyLink(link);
        });
        this.diagram.repaint();
      },
      () => {/*This is intentional (SonarQube)*/}
    );
  }

  onAutoDistribute() {
    this.diagram.dagreDistributeNodes();
  }

  onDetailsToggle() {
    this.setState((prevState)=>({
      show_details: !prevState.show_details,
    }), ()=>{
      this.diagram.getModel().getNodes().forEach((node)=>{
        node.fireEvent({show_details: this.state.show_details}, 'toggleDetails');
      });
    });
  }

  onHelpClick() {
    let url = url_for('help.static', {'filename': 'erd_tool.html'});
    if (this.props.pgWindow) {
      this.props.pgWindow.open(url, 'pgadmin_help');
    }
    else {
      window.open(url, 'pgadmin_help');
    }
  }

  onLoadDiagram() {
    var params = {
      'supported_types': ['pgerd'], // file types allowed
      'dialog_type': 'select_file', // open select file dialog
    };
    this.props.pgAdmin.FileManager.init();
    this.props.pgAdmin.FileManager.show_dialog(params);
  }

  openFile(fileName) {
    this.setLoading(gettext('Loading project...'));
    axios.post(url_for('sqleditor.load_file'), {
      'file_name': decodeURI(fileName),
    }).then((res)=>{
      this.setState({
        current_file: fileName,
        dirty: false,
      });
      this.setTitle(fileName);
      this.diagram.deserialize(res.data);
      this.diagram.clearSelection();
      this.registerModelEvents();
    }).catch((err)=>{
      this.handleAxiosCatch(err);
    }).then(()=>{
      this.setLoading(null);
    });
  }

  onSaveDiagram(isSaveAs=false, closeOnSave=false) {
    this.closeOnSave = closeOnSave;
    if(this.state.current_file && !isSaveAs) {
      this.saveFile(this.state.current_file);
    } else {
      var params = {
        'supported_types': ['pgerd'],
        'dialog_type': 'create_file',
        'dialog_title': 'Save File',
        'btn_primary': 'Save',
      };
      this.props.pgAdmin.FileManager.init();
      this.props.pgAdmin.FileManager.show_dialog(params);
    }
  }

  onSaveAsDiagram() {
    this.onSaveDiagram(true);
  }

  saveFile(fileName) {
    this.setLoading(gettext('Saving...'));
    axios.post(url_for('sqleditor.save_file'), {
      'file_name': decodeURI(fileName),
      'file_content': JSON.stringify(this.diagram.serialize(this.props.pgAdmin.Browser.utils.app_version_int)),
    }).then(()=>{
      Notify.success(gettext('Project saved successfully.'));
      this.setState({
        current_file: fileName,
        dirty: false,
      });
      this.setTitle(fileName);
      this.setLoading(null);
      if(this.closeOnSave) {
        this.closePanel.call(this);
      }
    }).catch((err)=>{
      this.setLoading(null);
      this.handleAxiosCatch(err);
    });
  }

  getCurrentProjectName(path) {
    let currPath = path || this.state.current_file || 'Untitled';
    return currPath.split('\\').pop().split('/').pop();
  }

  setTitle(title, dirty=false) {
    if(title === null || title === '') {
      title = 'Untitled';
    }
    title = this.getCurrentProjectName(title) + (dirty ? '*': '');
    if (this.state.is_new_tab) {
      window.document.title = title;
    } else {
      setPanelTitle(this.props.panel, title);
    }
  }

  onSQLClick() {
    let scriptHeader = gettext('-- This script was generated by a beta version of the ERD tool in pgAdmin 4.\n');
    scriptHeader += gettext('-- Please log an issue at https://redmine.postgresql.org/projects/pgadmin4/issues/new if you find any bugs, including reproduction steps.\n');

    let url = url_for('erd.sql', {
      trans_id: this.props.params.trans_id,
      sgid: this.props.params.sgid,
      sid: this.props.params.sid,
      did: this.props.params.did,
    });

    this.setLoading(gettext('Preparing the SQL...'));
    axios.post(url, this.diagram.serializeData())
      .then((resp)=>{
        let sqlScript = resp.data.data;
        sqlScript = scriptHeader + 'BEGIN;\n' + sqlScript + '\nEND;';

        let parentData = {
          sgid: this.props.params.sgid,
          sid: this.props.params.sid,
          did: this.props.params.did,
          stype: this.props.params.server_type,
        };

        let sqlId = `erd${this.props.params.trans_id}`;
        localStorage.setItem(sqlId, sqlScript);
        showERDSqlTool(parentData, sqlId, this.props.params.title, this.props.pgWindow.pgAdmin.Tools.SQLEditor, this.props.alertify);
      })
      .catch((error)=>{
        this.handleAxiosCatch(error);
      })
      .then(()=>{
        this.setLoading(null);
      });
  }

  onImageClick() {
    this.setLoading(gettext('Preparing the image...'));

    /* Move the diagram temporarily to align it to top-left of the canvas so that when
     * taking the snapshot all the nodes are covered. Once the image is taken, repaint
     * the canvas back to original state.
     * Code referred from - zoomToFitNodes function.
     */
    let nodesRect = this.diagram.getEngine().getBoundingNodesRect(this.diagram.getModel().getNodes(), 10);
    let canvasRect = this.canvasEle.getBoundingClientRect();
    let canvasTopLeftPoint = {
      x: canvasRect.left,
      y: canvasRect.top
    };
    let nodeLayerTopLeftPoint = {
      x: canvasTopLeftPoint.x + this.diagram.getModel().getOffsetX(),
      y: canvasTopLeftPoint.y + this.diagram.getModel().getOffsetY()
    };
    let nodesRectTopLeftPoint = {
      x: nodeLayerTopLeftPoint.x + nodesRect.getTopLeft().x,
      y: nodeLayerTopLeftPoint.y + nodesRect.getTopLeft().y
    };
    let prevTransform = this.canvasEle.querySelector('div').style.transform;
    this.canvasEle.childNodes.forEach((ele)=>{
      ele.style.transform = `translate(${nodeLayerTopLeftPoint.x - nodesRectTopLeftPoint.x}px, ${nodeLayerTopLeftPoint.y - nodesRectTopLeftPoint.y}px) scale(1.0)`;
    });

    /* Change the styles for suiting html2canvas */
    this.canvasEle.classList.add('html2canvas-reset');
    this.canvasEle.style.width = this.canvasEle.scrollWidth + 'px';
    this.canvasEle.style.height = this.canvasEle.scrollHeight + 'px';

    /* html2canvas ignores CSS styles, set the CSS styles to inline */
    const setSvgInlineStyles = (targetElem) => {
      const transformProperties = [
        'fill',
        'color',
        'font-size',
        'stroke',
        'font'
      ];
      let svgElems = Array.from(targetElem.getElementsByTagName('svg'));
      for (let svgEle of svgElems) {
        svgEle.setAttribute('width', svgEle.clientWidth);
        svgEle.setAttribute('height', svgEle.clientHeight);
        /* Wrap the SVG in a div tag so that transforms are consistent with html */
        let wrap = document.createElement('div');
        wrap.setAttribute('style', svgEle.getAttribute('style'));
        svgEle.setAttribute('style', null);
        svgEle.parentNode.insertBefore(wrap, svgEle);
        wrap.appendChild(svgEle);
        recurseElementChildren(svgEle);
      }
      function recurseElementChildren(node) {
        if (!node.style)
          return;

        let styles = getComputedStyle(node);
        for (let transformProperty of transformProperties) {
          node.style[transformProperty] = styles[transformProperty];
        }
        for (let child of Array.from(node.childNodes)) {
          recurseElementChildren(child);
        }
      }
    };

    setTimeout(()=>{
      let width = this.canvasEle.scrollWidth + 10;
      let height = this.canvasEle.scrollHeight + 10;
      let isCut = false;
      /* Canvas limitation - https://html2canvas.hertzen.com/faq */
      if(width >= 32767){
        width = 32766;
        isCut = true;
      }
      if(height >= 32767){
        height = 32766;
        isCut = true;
      }
      html2canvas(this.canvasEle, {
        width: width,
        height: height,
        scrollX: 0,
        scrollY: 0,
        scale: 1,
        useCORS: true,
        allowTaint: true,
        backgroundColor: window.getComputedStyle(this.canvasEle).backgroundColor,
        onclone: (clonedEle)=>{
          setSvgInlineStyles(clonedEle);
          return clonedEle;
        },
      }).then((canvas)=>{
        let link = document.createElement('a');
        link.setAttribute('href', canvas.toDataURL('image/png'));
        link.setAttribute('download', this.getCurrentProjectName() + '.png');
        link.click();
        link.remove();
      }).catch((err)=>{
        console.error(err);
        let msg = gettext('Unknown error. Check console logs');
        if(err.name) {
          msg = `${err.name}: ${err.message}`;
        }
        Notify.alert(gettext('Error'), msg);
      }).then(()=>{
        /* Revert back to the original CSS styles */
        this.canvasEle.classList.remove('html2canvas-reset');
        this.canvasEle.style.width = '';
        this.canvasEle.style.height = '';
        this.canvasEle.childNodes.forEach((ele)=>{
          ele.style.transform = prevTransform;
        });
        this.setLoading(null);
        if(isCut) {
          Notify.alert(gettext('Maximum image size limit'),
            gettext('The downloaded image has exceeded the maximum size of 32767 x 32767 pixels, and has been cropped to that size.'));
        }
      });
    }, 1000);
  }

  onOneToManyClick() {
    let dialog = this.getDialog('onetomany_dialog');
    let initData = {local_table_uid: this.diagram.getSelectedNodes()[0].getID()};
    dialog(gettext('One to many relation'), initData, (newData)=>{
      this.diagram.addOneToManyLink(newData);
    });
  }

  onManyToManyClick() {
    let dialog = this.getDialog('manytomany_dialog');
    let initData = {left_table_uid: this.diagram.getSelectedNodes()[0].getID()};
    dialog(gettext('Many to many relation'), initData, (newData)=>{
      this.diagram.addManyToManyLink(newData);
    });
  }

  showNote(noteNode) {
    if(noteNode) {
      this.noteRefEle = this.diagram.getEngine().getNodeElement(noteNode);
      this.setState({
        note_node: noteNode,
        note_open: true,
      });
    }
  }

  onNoteClick() {
    let noteNode = this.diagram.getSelectedNodes()[0];
    this.showNote(noteNode);
  }

  onNoteClose(updated) {
    this.setState({note_open: false});
    updated && this.diagram.fireEvent({}, 'nodesUpdated', true);
  }

  async initConnection() {
    this.setLoading(gettext('Initializing connection...'));
    this.setState({conn_status: CONNECT_STATUS.CONNECTING});

    let initUrl = url_for('erd.initialize', {
      trans_id: this.props.params.trans_id,
      sgid: this.props.params.sgid,
      sid: this.props.params.sid,
      did: this.props.params.did,
    });

    try {
      let response = await axios.post(initUrl);
      this.setState({
        conn_status: CONNECT_STATUS.CONNECTED,
        server_version: response.data.data.serverVersion,
      });
      return true;
    } catch (error) {
      this.setState({conn_status: CONNECT_STATUS.FAILED});
      this.handleAxiosCatch(error);
      return false;
    } finally {
      this.setLoading(null);
    }
  }

  /* Get all prequisite in one conn since
   * we have only one connection
   */
  async loadPrequisiteData() {
    this.setLoading(gettext('Fetching required data...'));
    let url = url_for('erd.prequisite', {
      trans_id: this.props.params.trans_id,
      sgid: this.props.params.sgid,
      sid: this.props.params.sid,
      did: this.props.params.did,
    });

    try {
      let response = await axios.get(url);
      let data = response.data.data;
      this.diagram.setCache('colTypes', data['col_types']);
      this.diagram.setCache('schemas', data['schemas']);
      return true;
    } catch (error) {
      this.handleAxiosCatch(error);
      return false;
    } finally {
      this.setLoading(null);
    }
  }

  async loadTablesData() {
    this.setLoading(gettext('Fetching schema data...'));
    let url = url_for('erd.tables', {
      trans_id: this.props.params.trans_id,
      sgid: this.props.params.sgid,
      sid: this.props.params.sid,
      did: this.props.params.did,
    });

    try {
      let response = await axios.get(url);
      this.diagram.deserializeData(response.data.data);
      return true;
    } catch (error) {
      this.handleAxiosCatch(error);
      return false;
    } finally {
      this.setLoading(null);
    }
  }

  render() {
    return (
      <Theme>
        <ToolBar id="btn-toolbar">
          <ButtonGroup>
            <IconButton id="open-file" icon="fa fa-folder-open" onClick={this.onLoadDiagram} title={gettext('Load from file')}
              shortcut={this.state.preferences.open_project}/>
            <IconButton id="save-erd" icon="fa fa-save" onClick={()=>{this.onSaveDiagram();}} title={gettext('Save project')}
              shortcut={this.state.preferences.save_project} disabled={!this.state.dirty}/>
            <IconButton id="save-as-erd" icon="fa fa-share-square" onClick={this.onSaveAsDiagram} title={gettext('Save as')}
              shortcut={this.state.preferences.save_project_as}/>
          </ButtonGroup>
          <ButtonGroup>
            <IconButton id="save-sql" icon="fa fa-file-code" onClick={this.onSQLClick} title={gettext('Generate SQL')}
              shortcut={this.state.preferences.generate_sql}/>
            <IconButton id="save-image" icon="fa fa-file-image" onClick={this.onImageClick} title={gettext('Download image')}
              shortcut={this.state.preferences.download_image}/>
          </ButtonGroup>
          <ButtonGroup>
            <IconButton id="add-node" icon="fa fa-plus-square" onClick={this.onAddNewNode} title={gettext('Add table')}
              shortcut={this.state.preferences.add_table}/>
            <IconButton id="edit-node" icon="fa fa-pencil-alt" onClick={this.onEditTable} title={gettext('Edit table')}
              shortcut={this.state.preferences.edit_table} disabled={!this.state.single_node_selected || this.state.single_link_selected}/>
            <IconButton id="clone-node" icon="fa fa-clone" onClick={this.onCloneNode} title={gettext('Clone table')}
              shortcut={this.state.preferences.clone_table} disabled={!this.state.single_node_selected || this.state.single_link_selected}/>
            <IconButton id="delete-node" icon="fa fa-trash-alt" onClick={this.onDeleteNode} title={gettext('Drop table/link')}
              shortcut={this.state.preferences.drop_table} disabled={!this.state.any_item_selected}/>
          </ButtonGroup>
          <ButtonGroup>
            <IconButton id="add-onetomany" text="1M" onClick={this.onOneToManyClick} title={gettext('One-to-Many link')}
              shortcut={this.state.preferences.one_to_many} disabled={!this.state.single_node_selected || this.state.single_link_selected}/>
            <IconButton id="add-manytomany" text="MM" onClick={this.onManyToManyClick} title={gettext('Many-to-Many link')}
              shortcut={this.state.preferences.many_to_many} disabled={!this.state.single_node_selected || this.state.single_link_selected}/>
          </ButtonGroup>
          <ButtonGroup>
            <IconButton id="add-note" icon="fa fa-sticky-note" onClick={this.onNoteClick} title={gettext('Add/Edit note')}
              shortcut={this.state.preferences.add_edit_note} disabled={!this.state.single_node_selected || this.state.single_link_selected}/>
            <IconButton id="auto-align" icon="fa fa-magic" onClick={this.onAutoDistribute} title={gettext('Auto align')}
              shortcut={this.state.preferences.auto_align} />
            <DetailsToggleButton id="more-details" onClick={this.onDetailsToggle} showDetails={this.state.show_details}
              shortcut={this.state.preferences.show_details} />
          </ButtonGroup>
          <ButtonGroup>
            <IconButton id="zoom-to-fit" icon="fa fa-compress" onClick={this.diagram.zoomToFit} title={gettext('Zoom to fit')}
              shortcut={this.state.preferences.zoom_to_fit}/>
            <IconButton id="zoom-in" icon="fa fa-search-plus" onClick={this.diagram.zoomIn} title={gettext('Zoom in')}
              shortcut={this.state.preferences.zoom_in}/>
            <IconButton id="zoom-out" icon="fa fa-search-minus" onClick={this.diagram.zoomOut} title={gettext('Zoom out')}
              shortcut={this.state.preferences.zoom_out}/>
          </ButtonGroup>
          <ButtonGroup>
            <IconButton id="help" icon="fa fa-question" onClick={this.onHelpClick} title={gettext('Help')} />
          </ButtonGroup>
        </ToolBar>
        <ConnectionBar statusId="btn-conn-status" status={this.state.conn_status} bgcolor={this.props.params.bgcolor}
          fgcolor={this.props.params.fgcolor} title={this.props.params.title}/>
        <FloatingNote open={this.state.note_open} onClose={this.onNoteClose}
          reference={this.noteRefEle} noteNode={this.state.note_node} appendTo={this.diagramContainerRef.current} rows={8}/>
        <div className="diagram-container" ref={this.diagramContainerRef} onDrop={this.onDropNode} onDragOver={e => {e.preventDefault();}}>
          <Loader message={this.state.loading_msg} autoEllipsis={true}/>
          <CanvasWidget className="diagram-canvas flex-grow-1" ref={(ele)=>{this.canvasEle = ele?.ref?.current;}} engine={this.diagram.getEngine()} />
        </div>
      </Theme>
    );
  }
}


BodyWidget.propTypes = {
  params:PropTypes.shape({
    trans_id: PropTypes.number.isRequired,
    sgid: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    sid: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    did: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
    server_type: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    bgcolor: PropTypes.string,
    fgcolor: PropTypes.string,
    gen: PropTypes.bool.isRequired,
  }),
  getDialog: PropTypes.func.isRequired,
  pgWindow: PropTypes.object.isRequired,
  pgAdmin: PropTypes.object.isRequired,
  alertify: PropTypes.object.isRequired,
  panel: PropTypes.object,
};
