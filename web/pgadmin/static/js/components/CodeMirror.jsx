/////////////////////////////////////////////////////////////
//
// pgAdmin 4 - PostgreSQL Tools
//
// Copyright (C) 2013 - 2022, The pgAdmin Development Team
// This software is released under the PostgreSQL Licence
//
//////////////////////////////////////////////////////////////

import React, { useEffect, useMemo, useRef, useState } from 'react';
import OrigCodeMirror from 'bundled_codemirror';
import {useOnScreen} from 'sources/custom_hooks';
import PropTypes from 'prop-types';
import CustomPropTypes from '../custom_prop_types';
import pgWindow from 'sources/window';
import gettext from 'sources/gettext';
import { Box, InputAdornment, makeStyles } from '@material-ui/core';
import clsx from 'clsx';
import { InputText } from './FormComponents';
import { PgIconButton } from './Buttons';
import CloseIcon from '@material-ui/icons/CloseRounded';
import ArrowDownwardRoundedIcon from '@material-ui/icons/ArrowDownwardRounded';
import ArrowUpwardRoundedIcon from '@material-ui/icons/ArrowUpwardRounded';
import SwapHorizRoundedIcon from '@material-ui/icons/SwapHorizRounded';
import SwapCallsRoundedIcon from '@material-ui/icons/SwapCallsRounded';
import _ from 'lodash';
import { RegexIcon, FormatCaseIcon } from './ExternalIcon';
import { isMac } from '../keyboard_shortcuts';

const useStyles = makeStyles((theme)=>({
  root: {
    position: 'relative',
  },
  hideCursor: {
    '& .CodeMirror-cursors': {
      display: 'none'
    }
  },
  findDialog: {
    position: 'absolute',
    zIndex: 99,
    right: '4px',
    ...theme.mixins.panelBorder.all,
    borderTop: 'none',
    padding: '2px 4px',
    width: '250px',
    backgroundColor: theme.palette.background.default,
  },
  marginTop: {
    marginTop: '0.25rem',
  }
}));

function parseString(string) {
  return string.replace(/\\([nrt\\])/g, function(match, ch) {
    if (ch == 'n') return '\n';
    if (ch == 'r') return '\r';
    if (ch == 't') return '\t';
    if (ch == '\\') return '\\';
    return match;
  });
}

function parseQuery(query, useRegex=false, matchCase=false) {
  if (useRegex) {
    query = new RegExp(query, matchCase ? 'g': 'gi');
  } else {
    query = parseString(query);
    if(!matchCase) {
      query = query.toLowerCase();
    }
  }
  if (typeof query == 'string' ? query == '' : query.test(''))
    query = /x^/;
  return query;
}

function getRegexFinder(query) {
  return (stream) => {
    query.lastIndex = stream.pos;
    var match = query.exec(stream.string);
    if (match && match.index == stream.pos) {
      stream.pos += match[0].length || 1;
      return 'searching';
    } else if (match) {
      stream.pos = match.index;
    } else {
      stream.skipToEnd();
    }
  };
}


function getPlainStringFinder(query, matchCase) {
  return (stream) => {
    var matchIndex = (matchCase ? stream.string :  stream.string.toLowerCase()).indexOf(query, stream.pos);
    if(matchIndex == -1) {
      stream.skipToEnd();
    } else if(matchIndex == stream.pos) {
      stream.pos += query.length;
      return 'searching';
    } else {
      stream.pos = matchIndex;
    }
  };
}

function searchOverlay(query, matchCase) {
  return {
    token: typeof query == 'string' ?
      getPlainStringFinder(query, matchCase) : getRegexFinder(query)
  };
}

export const CodeMirrorInstancType = PropTypes.shape({
  getCursor: PropTypes.func,
  getSearchCursor: PropTypes.func,
  removeOverlay: PropTypes.func,
  addOverlay: PropTypes.func,
  setSelection: PropTypes.func,
  scrollIntoView: PropTypes.func,
});

export function FindDialog({editor, show, replace, onClose}) {
  const [findVal, setFindVal] = useState('');
  const [replaceVal, setReplaceVal] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [matchCase, setMatchCase] = useState(false);
  const findInputRef = useRef();
  const highlightsearch = useRef();
  const searchCursor = useRef();
  const classes = useStyles();

  const search = ()=>{
    if(editor) {
      let query = parseQuery(findVal, useRegex, matchCase);
      searchCursor.current = editor.getSearchCursor(query, editor.getCursor(true), !matchCase);
      if(findVal != '') {
        editor.removeOverlay(highlightsearch.current);
        highlightsearch.current = searchOverlay(query, matchCase);
        editor.addOverlay(highlightsearch.current);
        onFindNext();
      } else {
        editor.removeOverlay(highlightsearch.current);
      }
    }
  };

  useEffect(()=>{
    if(show) {
      findInputRef.current && findInputRef.current.select();
      search();
    }
  }, [show]);

  useEffect(()=>{
    search();
  }, [findVal, useRegex, matchCase]);

  const clearAndClose = ()=>{
    editor.removeOverlay(highlightsearch.current);
    onClose();
  };

  const toggle = (name)=>{
    if(name == 'regex') {
      setUseRegex((prev)=>!prev);
    } else if(name == 'case') {
      setMatchCase((prev)=>!prev);
    }
  };

  const onFindEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if(e.shiftKey) {
        onFindPrev();
      } else {
        onFindNext();
      }
    }
  };

  const onReplaceEnter = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onReplace();
    }
  };

  const onEscape = (e)=>{
    if (e.key === 'Escape') {
      e.preventDefault();
      clearAndClose();
    }
  };

  const onFindNext = ()=>{
    if(searchCursor.current && searchCursor.current.find()) {
      editor.setSelection(searchCursor.current.from(), searchCursor.current.to());
      editor.scrollIntoView({
        from: searchCursor.current.from(),
        to: searchCursor.current.to()
      }, 20);
    }
  };

  const onFindPrev = ()=>{
    if(searchCursor.current && searchCursor.current.find(true)) {
      editor.setSelection(searchCursor.current.from(), searchCursor.current.to());
      editor.scrollIntoView({
        from: searchCursor.current.from(),
        to: searchCursor.current.to()
      }, 20);
    }
  };

  const onReplace = ()=>{
    searchCursor.current.replace(replaceVal);
    onFindNext();
  };

  const onReplaceAll = ()=>{
    while(searchCursor.current.from()) {
      onReplace();
    }
  };

  if(!editor) {
    return <></>;
  }

  return (
    <Box className={classes.findDialog} visibility={show ? 'visible' : 'hidden'} tabIndex="0" onKeyDown={onEscape}>
      <InputText value={findVal}
        inputRef={(ele)=>{findInputRef.current = ele;}}
        onChange={(value)=>setFindVal(value)}
        onKeyPress={onFindEnter}
        endAdornment={
          <InputAdornment position="end">
            <PgIconButton data-test="case" title="Match case" icon={<FormatCaseIcon />} size="xs" noBorder
              onClick={()=>toggle('case')} color={matchCase ? 'primary' : 'default'} style={{marginRight: '2px'}}/>
            <PgIconButton data-test="regex" title="Use regex" icon={<RegexIcon />} size="xs" noBorder
              onClick={()=>toggle('regex')} color={useRegex ? 'primary' : 'default'}/>
          </InputAdornment>
        }
      />
      {replace &&
      <InputText value={replaceVal}
        className={classes.marginTop}
        onChange={(value)=>setReplaceVal(value)}
        onKeyPress={onReplaceEnter}
      />}

      <Box display="flex" className={classes.marginTop}>
        <PgIconButton title={gettext('Previous')} icon={<ArrowUpwardRoundedIcon />} size="xs" noBorder onClick={onFindPrev} />
        <PgIconButton title={gettext('Next')} icon={<ArrowDownwardRoundedIcon />} size="xs" noBorder onClick={onFindNext}/>
        {replace && <>
          <PgIconButton title={gettext('Replace')} icon={<SwapHorizRoundedIcon style={{height: 'unset'}}/>} size="xs" noBorder onClick={onReplace} />
          <PgIconButton title={gettext('Replace All')} icon={<SwapCallsRoundedIcon />} size="xs" noBorder onClick={onReplaceAll}/>
        </>}
        <Box marginLeft="auto">
          <PgIconButton title={gettext('Close')} icon={<CloseIcon />} size="xs" noBorder onClick={clearAndClose}/>
        </Box>
      </Box>
    </Box>
  );
}

FindDialog.propTypes = {
  editor: CodeMirrorInstancType,
  show: PropTypes.bool,
  replace: PropTypes.bool,
  onClose: PropTypes.func,
};

function handleDrop(editor, e) {
  var dropDetails = null;
  try {
    dropDetails = JSON.parse(e.dataTransfer.getData('text'));

    /* Stop firefox from redirecting */

    if(e.preventDefault) {
      e.preventDefault();
    }
    if (e.stopPropagation) {
      e.stopPropagation();
    }
  } catch(error) {
    /* if parsing fails, it must be the drag internal of codemirror text */
    return;
  }

  var cursor = editor.coordsChar({
    left: e.x,
    top: e.y,
  });
  editor.replaceRange(dropDetails.text, cursor);
  editor.focus();
  editor.setSelection({
    ...cursor,
    ch: cursor.ch + dropDetails.cur.from,
  },{
    ...cursor,
    ch: cursor.ch +dropDetails.cur.to,
  });
}

function calcFontSize(fontSize) {
  if(fontSize) {
    fontSize = parseFloat((Math.round(parseFloat(fontSize + 'e+2')) + 'e-2'));
    let rounded = Number(fontSize);
    if(rounded > 0) {
      return rounded + 'em';
    }
  }
  return '1em';
}

/* React wrapper for CodeMirror */
export default function CodeMirror({currEditor, name, value, options, events, readonly, disabled, className, autocomplete=false}) {
  const taRef = useRef();
  const editor = useRef();
  const cmWrapper = useRef();
  const isVisibleTrack = useRef();
  const classes = useStyles();
  const [[showFind, isReplace], setShowFind] = useState([false, false]);
  const defaultOptions = useMemo(()=>{
    let goLeftKey = 'Ctrl-Alt-Left',
      goRightKey = 'Ctrl-Alt-Right',
      commentKey = 'Ctrl-/';
    if(isMac()) {
      goLeftKey = 'Cmd-Alt-Left';
      goRightKey = 'Cmd-Alt-Right';
      commentKey = 'Cmd-/';
    }
    return {
      tabindex: '0',
      lineNumbers: true,
      styleSelectedText: true,
      mode: 'text/x-pgsql',
      foldOptions: {
        widget: '\u2026',
      },
      foldGutter: true,
      gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
      extraKeys: {
        // Autocomplete sql command
        ...(autocomplete ? {
          'Ctrl-Space': 'autocomplete',
        }: {}),
        'Alt-Up': 'goLineUp',
        'Alt-Down': 'goLineDown',
        // Move word by word left/right
        [goLeftKey]: 'goGroupLeft',
        [goRightKey]: 'goGroupRight',
        // Allow user to delete Tab(s)
        'Shift-Tab': 'indentLess',
        //comment
        [commentKey]: 'toggleComment',
      },
      dragDrop: true,
      screenReaderLabel: gettext('SQL editor'),
    };
  });

  useEffect(()=>{
    const finalOptions = {...defaultOptions, ...options};
    /* Create the object only once on mount */
    editor.current = new OrigCodeMirror.fromTextArea(
      taRef.current, finalOptions);

    if(!_.isEmpty(value)) {
      editor.current.setValue(value);
    } else {
      editor.current.setValue('');
    }
    currEditor && currEditor(editor.current);
    if(editor.current) {
      try {
        cmWrapper.current = editor.current.getWrapperElement();
      } catch(e) {
        cmWrapper.current = null;
      }

      let findKey = 'Ctrl-F', replaceKey = 'Shift-Ctrl-F';
      if(isMac()) {
        findKey = 'Cmd-F';
        replaceKey = 'Cmd-Alt-F';
      }
      editor.current.addKeyMap({
        [findKey]: ()=>{
          setShowFind([false, false]);
          setShowFind([true, false]);
        },
        [replaceKey]: ()=>{
          if(!finalOptions.readOnly) {
            setShowFind([false, false]);
            setShowFind([true, true]);
          }
        },
        'Cmd-G': false,
      });
    }

    Object.keys(events||{}).forEach((eventName)=>{
      editor.current.on(eventName, events[eventName]);
    });
    editor.current.on('drop', handleDrop);
    initPreferences();
    return ()=>{
      editor.current?.toTextArea();
    };
  }, []);

  const initPreferences = ()=>{
    reflectPreferences();
    pgWindow?.pgAdmin?.Browser?.onPreferencesChange('sqleditor', function() {
      reflectPreferences();
    });
  };

  const reflectPreferences = ()=>{
    let pref = pgWindow?.pgAdmin?.Browser?.get_preferences_for_module('sqleditor') || {};
    let wrapEle = editor?.current.getWrapperElement();
    wrapEle && (wrapEle.style.fontSize = calcFontSize(pref.sql_font_size));

    if(pref.plain_editor_mode) {
      editor?.current.setOption('mode', 'text/plain');
      /* Although not required, setting explicitly as codemirror will remove code folding only on next edit */
      editor?.current.setOption('foldGutter', false);
    } else {
      editor?.current.setOption('mode', 'text/x-pgsql');
      editor?.current.setOption('foldGutter', pref.code_folding);
    }

    editor?.current.setOption('indentWithTabs', pref.indent_with_tabs);
    editor?.current.setOption('indentUnit', pref.tab_size);
    editor?.current.setOption('tabSize', pref.tab_size);
    editor?.current.setOption('lineWrapping', pref.wrap_code);
    editor?.current.setOption('autoCloseBrackets', pref.insert_pair_brackets);
    editor?.current.setOption('matchBrackets', pref.brace_matching);
    editor?.current.refresh();
  };

  useEffect(()=>{
    if(editor.current) {
      if(disabled) {
        editor.current.setOption('readOnly', true);
        cmWrapper.current.classList.add(classes.hideCursor);
      } else if(readonly) {
        editor.current.setOption('readOnly', true);
        editor.current.addKeyMap({'Tab': false});
        editor.current.addKeyMap({'Shift-Tab': false});
        cmWrapper.current.classList.add(classes.hideCursor);
      } else {
        cmWrapper.current.classList.remove('cm_disabled');
        editor.current.setOption('readOnly', false);
        editor.current.removeKeyMap('Tab');
        editor.current.removeKeyMap('Shift-Tab');
      }
    }
  }, [readonly, disabled]);

  useMemo(() => {
    if(editor.current) {
      if(value != editor.current.getValue()) {
        if(!_.isEmpty(value)) {
          editor.current.setValue(value);
        } else {
          editor.current.setValue('');
        }
      }
    }
  }, [value]);

  const onScreenVisible = useOnScreen(cmWrapper);
  if(!isVisibleTrack.current && onScreenVisible) {
    isVisibleTrack.current = true;
    editor.current?.refresh();
  } else if(!onScreenVisible) {
    isVisibleTrack.current = false;
  }

  const closeFind = ()=>{
    setShowFind([false, false]);
    editor.current?.focus();
  };

  return (
    <div className={clsx(className, classes.root)}>
      <FindDialog editor={editor.current} show={showFind} replace={isReplace} onClose={closeFind}/>
      <textarea ref={taRef} name={name} />
    </div>
  );
}

CodeMirror.propTypes = {
  currEditor: PropTypes.func,
  name: PropTypes.string,
  value: PropTypes.string,
  options: PropTypes.object,
  change: PropTypes.func,
  events: PropTypes.object,
  readonly: PropTypes.bool,
  disabled: PropTypes.bool,
  className: CustomPropTypes.className,
  autocomplete: PropTypes.bool,
};
