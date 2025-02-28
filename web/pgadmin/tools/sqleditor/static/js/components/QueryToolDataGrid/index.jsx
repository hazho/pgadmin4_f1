/////////////////////////////////////////////////////////////
//
// pgAdmin 4 - PostgreSQL Tools
//
// Copyright (C) 2013 - 2022, The pgAdmin Development Team
// This software is released under the PostgreSQL Licence
//
//////////////////////////////////////////////////////////////
import { Box, makeStyles } from '@material-ui/core';
import _ from 'lodash';
import React, {useState, useEffect, useCallback, useContext, useRef} from 'react';
import ReactDataGrid, {Row, useRowSelection} from 'react-data-grid';
import LockIcon from '@material-ui/icons/Lock';
import EditIcon from '@material-ui/icons/Edit';
import { QUERY_TOOL_EVENTS } from '../QueryToolConstants';
import * as Editors from './Editors';
import * as Formatters from './Formatters';
import clsx from 'clsx';
import { PgIconButton } from '../../../../../../static/js/components/Buttons';
import MapIcon from '@material-ui/icons/Map';
import { QueryToolEventsContext } from '../QueryToolComponent';
import PropTypes, { number } from 'prop-types';
import gettext from 'sources/gettext';

export const ROWNUM_KEY = '$_pgadmin_rownum_key_$';
export const GRID_ROW_SELECT_KEY = '$_pgadmin_gridrowselect_key_$';

const useStyles = makeStyles((theme)=>({
  root: {
    height: '100%',
    color: theme.palette.text.primary,
    backgroundColor: theme.otherVars.qtDatagridBg,
    fontSize: '12px',
    border: 'none',
    '--rdg-selection-color': theme.palette.primary.main,
    '& .rdg-cell': {
      ...theme.mixins.panelBorder.right,
      ...theme.mixins.panelBorder.bottom,
      fontWeight: 'abc',
      '&[aria-colindex="1"]': {
        padding: 0,
      }
    },
    '& .rdg-header-row .rdg-cell': {
      padding: 0,
    },
    '& .rdg-header-row': {
      backgroundColor: theme.palette.background.default,
      fontWeight: 'normal',
    },
    '& .rdg-row': {
      backgroundColor: theme.palette.background.default,
      '&[aria-selected=true]': {
        backgroundColor: theme.palette.primary.light,
        color: theme.otherVars.qtDatagridSelectFg,
        '& .rdg-cell:nth-child(1)': {
          backgroundColor: theme.palette.primary.main,
          color: theme.palette.primary.contrastText,
        }
      },
    }
  },
  columnHeader: {
    padding: '3px 6px',
    height: '100%',
    display: 'flex',
    lineHeight: '16px',
    alignItems: 'center',
  },
  columnName: {
    fontWeight: 'bold',
  },
  editedCell: {
    fontWeight: 'bold',
  },
  deletedRow: {
    '&:before': {
      content: '" "',
      position: 'absolute',
      top: '50%',
      left: 0,
      borderTop: '1px solid ' + theme.palette.error.main,
      width: '100%',
    }
  },
  rowNumCell: {
    padding: '0px 8px',
  },
  colHeaderSelected: {
    outlineColor: theme.palette.primary.main,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
  },
  colSelected: {
    outlineColor: theme.palette.primary.main,
    backgroundColor: theme.palette.primary.light,
    color: theme.otherVars.qtDatagridSelectFg,
  }
}));

export const RowInfoContext = React.createContext();

function CustomRow(props) {
  const rowRef = useRef();
  const rowInfoValue = {
    rowIdx: props.rowIdx,
    getCellElement: (colIdx)=>{
      return rowRef.current.querySelector(`.rdg-cell[aria-colindex="${colIdx+1}"]`);
    }
  };
  return (
    <RowInfoContext.Provider value={rowInfoValue}>
      <Row ref={rowRef} {...props} />
    </RowInfoContext.Provider>
  );
}

CustomRow.propTypes = {
  rowIdx: number,
};

function SelectAllHeaderRenderer(props) {
  const [checked, setChecked] = useState(false);
  const eventBus = useContext(QueryToolEventsContext);
  const onClick = ()=>{
    eventBus.fireEvent(QUERY_TOOL_EVENTS.FETCH_MORE_ROWS, true, ()=>{
      setChecked(!checked);
      props.onAllRowsSelectionChange(!checked);
    });
  };
  return <div style={{widht: '100%', height: '100%'}} onClick={onClick}></div>;
}
SelectAllHeaderRenderer.propTypes = {
  onAllRowsSelectionChange: PropTypes.func,
};

function SelectableHeaderRenderer({column, selectedColumns, onSelectedColumnsChange}) {
  const classes = useStyles();
  const eventBus = useContext(QueryToolEventsContext);

  const onClick = ()=>{
    eventBus.fireEvent(QUERY_TOOL_EVENTS.FETCH_MORE_ROWS, true, ()=>{
      const newSelectedCols = new Set(selectedColumns);
      if (newSelectedCols.has(column.idx)) {
        newSelectedCols.delete(column.idx);
      } else {
        newSelectedCols.add(column.idx);
      }
      onSelectedColumnsChange(newSelectedCols);
    });
  };

  const isSelected = selectedColumns.has(column.idx);

  return (
    <Box className={clsx(classes.columnHeader, isSelected ? classes.colHeaderSelected : null)} onClick={onClick}>
      {(column.column_type_internal == 'geometry' || column.column_type_internal == 'geography') &&
      <Box>
        <PgIconButton title={gettext('View all geometries in this column')} icon={<MapIcon />} size="small" style={{marginRight: '0.25rem'}} onClick={(e)=>{
          e.stopPropagation();
          eventBus.fireEvent(QUERY_TOOL_EVENTS.TRIGGER_RENDER_GEOMETRIES, column);
        }}/>
      </Box>}
      <Box marginRight="auto">
        <span className={classes.columnName}>{column.display_name}</span><br/>
        <span>{column.display_type}</span>
      </Box>
      <Box marginLeft="4px">{column.can_edit ?
        <EditIcon fontSize="small" style={{fontSize: '0.875rem'}} />:
        <LockIcon fontSize="small" style={{fontSize: '0.875rem'}} />
      }</Box>
    </Box>
  );
}
SelectableHeaderRenderer.propTypes = {
  column: PropTypes.object,
  selectedColumns: PropTypes.objectOf(Set),
  onSelectedColumnsChange: PropTypes.func,
};

function setEditorFormatter(col) {
  // If grid is editable then add editor else make it readonly
  if (col.cell == 'oid' && col.name == 'oid') {
    col.editor = null;
    col.formatter = Formatters.TextFormatter;
  } else if (col.cell == 'Json') {
    col.editor = Editors.JsonTextEditor;
    col.formatter = Formatters.TextFormatter;
  } else if (['number', 'oid'].indexOf(col.cell) != -1 || ['xid', 'real'].indexOf(col.type) != -1) {
    col.formatter = Formatters.NumberFormatter;
    col.editor = Editors.NumberEditor;
  } else if (col.cell == 'boolean') {
    col.editor = Editors.CheckboxEditor;
    col.formatter = Formatters.TextFormatter;
  } else if (col.cell == 'binary') {
    // We do not support editing binary data in SQL editor and data grid.
    col.editor = null;
    col.formatter = Formatters.BinaryFormatter;
  } else {
    col.editor = Editors.TextEditor;
    col.formatter = Formatters.TextFormatter;
  }
}

function cellClassGetter(col, classes, isSelected, dataChangeStore, rowKeyGetter){
  return (row)=>{
    let cellClasses = [];
    if(dataChangeStore && rowKeyGetter) {
      if(rowKeyGetter(row) in (dataChangeStore?.updated || {})
        && !_.isUndefined(dataChangeStore?.updated[rowKeyGetter(row)]?.data[col.key])
        || rowKeyGetter(row) in (dataChangeStore?.added || {})
      ) {
        cellClasses.push(classes.editedCell);
      }
      if(rowKeyGetter(row) in (dataChangeStore?.deleted || {})) {
        cellClasses.push(classes.deletedRow);
      }
    }
    if(isSelected) {
      cellClasses.push(classes.colSelected);
    }
    return clsx(cellClasses);
  };
}

function initialiseColumns(columns, rows, totalRowCount, columnWidthBy) {
  let retColumns = [
    ...columns,
  ];
  const canvas = document.createElement('canvas');
  const canvasContext = canvas.getContext('2d');
  canvasContext.font = '12px Roboto';

  for(const col of retColumns) {
    col.width = getTextWidth(col, rows, canvasContext, columnWidthBy);
    col.resizable = true;
    col.editorOptions = {
      commitOnOutsideClick: false,
      onCellKeyDown: (e)=>{
        /* Do not open the editor */
        e.preventDefault();
      }
    };
    setEditorFormatter(col);
  }

  let rowNumCol = {
    key: ROWNUM_KEY, name: '', frozen: true, resizable: false,
    minWidth: 45, width: canvasContext.measureText((totalRowCount||'').toString()).width,
  };
  rowNumCol.cellClass = cellClassGetter(rowNumCol);
  retColumns.unshift(rowNumCol);
  canvas.remove();
  return retColumns;
}

function formatColumns(columns, dataChangeStore, selectedColumns, onSelectedColumnsChange, rowKeyGetter, classes) {
  let retColumns = [
    ...columns,
  ];

  const HeaderRenderer = (props)=>{
    return <SelectableHeaderRenderer {...props} selectedColumns={selectedColumns} onSelectedColumnsChange={onSelectedColumnsChange}/>;
  };

  for(const [idx, col] of retColumns.entries()) {
    col.headerRenderer = HeaderRenderer;
    col.cellClass = cellClassGetter(col, classes, selectedColumns.has(idx), dataChangeStore, rowKeyGetter);
  }

  let rowNumCol = retColumns[0];
  rowNumCol.headerRenderer = SelectAllHeaderRenderer;
  rowNumCol.formatter = ({row})=>{
    const {rowIdx} = useContext(RowInfoContext);
    const [isRowSelected, onRowSelectionChange] = useRowSelection();
    let rowKey = rowKeyGetter(row);
    let rownum = rowIdx+1;
    if(rowKey in (dataChangeStore?.added || {})) {
      rownum = rownum+'+';
    } else if(rowKey in (dataChangeStore?.deleted || {})) {
      rownum = rownum+'-';
    }
    return (<div className={classes.rowNumCell} onClick={()=>{
      onSelectedColumnsChange(new Set());
      onRowSelectionChange({ row: row, checked: !isRowSelected, isShiftClick: false});
    }}>
      {rownum}
    </div>);
  };

  return retColumns;
}

function getTextWidth(column, rows, canvas, columnWidthBy) {
  const dataWidthReducer = (longest, nextRow) => {
    let value = nextRow[column.key];
    if(_.isNull(value) || _.isUndefined(value)) {
      value = '';
    }
    value = value.toString();
    return longest.length > value.length ? longest : value;
  };

  let columnHeaderLen = column.display_name.length > column.display_type.length ?
    canvas.measureText(column.display_name).width : canvas.measureText(column.display_type).width;
  /* padding 12, icon-width 15 */
  columnHeaderLen += 15 + 12;
  if(column.column_type_internal == 'geometry' || column.column_type_internal == 'geography') {
    columnHeaderLen += 40;
  }
  let width = columnHeaderLen;
  if(typeof(columnWidthBy) == 'number') {
    /* padding 16 */
    width = 16 + Math.ceil(canvas.measureText(rows.reduce(dataWidthReducer, '')).width);
    if(width > columnWidthBy && columnWidthBy > 0) {
      width = columnWidthBy;
    }
    if(width < columnHeaderLen) {
      width = columnHeaderLen;
    }
  }
  /* Gracefull */
  width += 2;
  return width;
}

export default function QueryToolDataGrid({columns, rows, totalRowCount, dataChangeStore,
  onSelectedCellChange, rowsResetKey, selectedColumns, onSelectedColumnsChange, columnWidthBy, ...props}) {
  const classes = useStyles();
  const [readyColumns, setColumns] = useState([]);
  const eventBus = useContext(QueryToolEventsContext);
  const onSelectedColumnsChangeWrapped = (arg)=>{
    props.onSelectedRowsChange(new Set());
    onSelectedColumnsChange(arg);
  };

  useEffect(()=>{
    if(columns.length > 0 || rows.length > 0) {
      let initCols = initialiseColumns(columns, rows, totalRowCount, columnWidthBy);
      setColumns(formatColumns(initCols, dataChangeStore, selectedColumns, onSelectedColumnsChangeWrapped, props.rowKeyGetter, classes));
    } else {
      setColumns([], [], 0);
    }
  }, [columns, rowsResetKey]);

  useEffect(()=>{
    setColumns((prevCols)=>{
      return formatColumns(prevCols, dataChangeStore, selectedColumns, onSelectedColumnsChangeWrapped, props.rowKeyGetter, classes);
    });
  }, [dataChangeStore, selectedColumns]);

  const onRowClick = useCallback((row, column)=>{
    if(column.key === ROWNUM_KEY) {
      onSelectedCellChange && onSelectedCellChange(null);
    } else {
      onSelectedCellChange && onSelectedCellChange([row, column]);
    }
  }, []);

  function handleCopy() {
    if (window.isSecureContext) {
      eventBus.fireEvent(QUERY_TOOL_EVENTS.TRIGGER_COPY_DATA);
    }
  }

  return (
    <ReactDataGrid
      id="datagrid"
      columns={readyColumns}
      rows={rows}
      className={classes.root}
      headerRowHeight={40}
      rowHeight={25}
      mincolumnWidthBy={50}
      enableCellSelect={true}
      onRowClick={onRowClick}
      onCopy={handleCopy}
      components={{
        rowRenderer: CustomRow,
      }}
      {...props}
    />
  );
}

QueryToolDataGrid.propTypes = {
  columns: PropTypes.array,
  rows: PropTypes.array,
  totalRowCount: PropTypes.number,
  dataChangeStore: PropTypes.object,
  onSelectedCellChange: PropTypes.func,
  onSelectedRowsChange: PropTypes.func,
  selectedColumns: PropTypes.objectOf(Set),
  onSelectedColumnsChange: PropTypes.func,
  rowKeyGetter: PropTypes.func,
  rowsResetKey: PropTypes.any,
  columnWidthBy: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
};
