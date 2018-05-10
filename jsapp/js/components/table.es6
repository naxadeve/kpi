import React from 'react';
import PropTypes from 'prop-types';
import autoBind from 'react-autobind';
import Reflux from 'reflux';
import reactMixin from 'react-mixin';
import _ from 'underscore';
import $ from 'jquery';
import {dataInterface} from '../dataInterface';

import actions from '../actions';
import bem from '../bem';
import ui from '../ui';
import stores from '../stores';
import mixins from '../mixins';
import alertify from 'alertifyjs';

import ReactTable from 'react-table'
import Select from 'react-select';
import {DebounceInput} from 'react-debounce-input';

import {
  VALIDATION_STATUSES
} from '../constants';

import {
  assign,
  t,
  log,
  notify,
  formatTimeDate
} from '../utils';

export class DataTable extends React.Component {
  constructor(props){
    super(props);
    this.state = {
      loading: true,
      tableData: [],
      columns: [],
      selectedColumns: false,
      frozenColumn: false,
      sids: [],
      showExpandedTable: false,
      defaultPageSize: 30,
      pageSize: 30,
      currentPage: 0,
      error: false,
      showLabels: true,
      translationIndex: 0,
      showGroups: true,
      resultsTotal: 0,
      selectedRows: {},
      selectAll: false,
      fetchState: false,
      promptRefresh: false,
      submissionPager: false
    };

    this.tableScrollTop = 0;
    autoBind(this);
  }
  requestData(instance) {
    let pageSize = instance.state.pageSize,
      page = instance.state.page * instance.state.pageSize,
      sort = instance.state.sorted,
      filter = instance.state.filtered,
      filterQuery = '';

    if (filter.length) {
      filterQuery = `&query={`;
      filter.forEach(function(f, i) {
        filterQuery += `"${f.id}":{"$regex":"${f.value}"}`;
        if (i < filter.length - 1)
          filterQuery += ',';
      });
      filterQuery += `}`;
      dataInterface.getSubmissions(this.props.asset.uid, pageSize, page, sort, [], filterQuery, true).done((data) => {
        if (data.count) {
          this.setState({resultsTotal: data.count});
        }
      });
    } else {
      this.setState({resultsTotal: this.props.asset.deployment__submission_count});
    }

    dataInterface.getSubmissions(this.props.asset.uid, pageSize, page, sort, [], filterQuery).done((data) => {
      if (data && data.length > 0) {
        if (this.state.submissionPager == 'next') {
          this.submissionModalProcessing(data[0]._id, data);
        }
        if (this.state.submissionPager == 'prev') {
          this.submissionModalProcessing(data[data.length - 1]._id, data);
        }
        this.setState({
          loading: false,
          selectedRows: {},
          selectAll: false,
          tableData: data,
          submissionPager: false
        })
        this._prepColumns(data);
      } else {
        if (filterQuery.length) {
          this.setState({
            loading: false
          });
          // TODO: debounce the queries and then enable this notification
          notify(t('The query did not return any results.'));
        } else {
          this.setState({error: t('Error: could not load data.'), loading: false});
        }
      }
    }).fail((error)=>{
      if (error.responseText)
        this.setState({error: error.responseText, loading: false});
      else if (error.statusText)
        this.setState({error: error.statusText, loading: false});
      else
        this.setState({error: t('Error: could not load data.'), loading: false});
    });
  }
  validationStatusChange(sid, index) {
    var _this = this;

    return function(selection) {
      const data = {"validation_status.uid": selection.value};
      dataInterface.updateSubmissionValidationStatus(_this.props.asset.uid, sid, data).done((result) => {
        if (result.uid) {
          _this.state.tableData[index]._validation_status = result.uid;
          _this.setState({tableData: _this.state.tableData});
        } else {
          console.error('error updating validation status');
        }
      }).fail((error)=>{
        console.error(error);
      });
    }
  }
  _prepColumns(data) {
    var excludes = ['_xform_id_string', '_attachments', '_notes', '_bamboo_dataset_id', '_status',
                    'formhub/uuid', '_tags', '_geolocation', '_submitted_by', 'meta/instanceID', 'meta/deprecatedID', '_validation_status'];

    var uniqueKeys = Object.keys(data.reduce(function(result, obj) {
      return Object.assign(result, obj);
    }, {}));

    uniqueKeys = uniqueKeys.filter((el, ind, arr) => excludes.includes(el) === false);

    let showLabels = this.state.showLabels,
        showGroups = this.state.showGroups,
        translationIndex = this.state.translationIndex,
        maxPageRes = Math.min(this.state.pageSize, this.state.tableData.length),
        _this = this;

    var columns = [];

    if (this.userCan('validate_submissions', this.props.asset)) {
      columns.push({
        Header: row => (
            <div className="table-header-checkbox">
              <input type="checkbox"
                id={`ch-head`}
                checked={Object.keys(this.state.selectedRows).length === maxPageRes ? true : false}
                onChange={this.bulkSelectAllRows} />
              <label htmlFor={`ch-head`}></label>
            </div>
          ),
        accessor: 'sub-checkbox',
        index: '__0',
        id: '__SubmissionCheckbox',
        minWidth: 45,
        filterable: false,
        sortable: false,
        Cell: row => (
          <div>
            <input type="checkbox"
                id={`ch-${row.row._id}`}
                checked={this.state.selectedRows[row.row._id] ? true : false}
                onChange={this.bulkUpdateChange} data-sid={row.row._id} />
            <label htmlFor={`ch-${row.row._id}`}></label>
          </div>
        )
      });
    }

    let userCanSeeEditIcon = this.props.asset.deployment__active && this.userCan('change_submissions', this.props.asset);

    columns.push({
      Header: '',
      accessor: 'sub-link',
      index: '__1',
      id: '__SubmissionLinks',
      minWidth: userCanSeeEditIcon ? 75 : 45,
      filterable: false,
      sortable: false,
      Cell: row => (
        <div>
          <span onClick={this.launchSubmissionModal} data-sid={row.row._id}
                className='rt-link' title={t('Open')}>
            <i className="k-icon k-icon-view"></i>
          </span>

          {userCanSeeEditIcon &&
            <span onClick={this.launchEditSubmission} data-sid={row.row._id}
                  className='rt-link' title={t('Edit')}>
              <i className="k-icon k-icon-edit"></i>
            </span>
          }
        </div>
      )
    });

    columns.push({
      Header: t('Validation status'),
      accessor: '_validation_status.uid',
      index: '__2',
      id: '__ValidationStatus',
      minWidth: 130,
      className: 'rt-status',
      Filter: ({ filter, onChange }) =>
        <select
          onChange={event => onChange(event.target.value)}
          style={{ width: "100%" }}
          value={filter ? filter.value : ""}>
          <option value="">Show All</option>
          {VALIDATION_STATUSES.map((item, n) => {
            return (
              <option value={item.value} key={n}>{item.label}</option>
            );
          })}
        </select>,
      Cell: row => (
        <Select
          disabled={!this.userCan('validate_submissions', this.props.asset)}
          clearable={false}
          value={this.state.tableData[row.index]._validation_status}
          options={VALIDATION_STATUSES}
          onChange={this.validationStatusChange(row.row._id, row.index)} />
      )
    });

    let survey = this.props.asset.content.survey;
    let choices = this.props.asset.content.choices;

    uniqueKeys.forEach(function(key){
      var q = undefined;
      var qParentG = [];
      if (key.includes('/')) {
        qParentG = key.split('/');
        q = survey.find(o => o.name === qParentG[qParentG.length - 1] || o.$autoname == qParentG[qParentG.length - 1]);
      } else {
        q = survey.find(o => o.name === key || o.$autoname == key);
      }

      if (q && q.type === 'begin_repeat')
        return false;

      // sets location of columns for questions not in current survey version
      var index = 'y_' + key;

      // place meta question columns at the very end
      switch(key) {
        case 'username':
            index = 'z1';
            break;
        case 'simserial':
            index = 'z2';
            break;
        case 'subscriberid':
            index = 'z3';
            break;
        case 'deviceid':
            index = 'z4';
            break;
        case 'phonenumber':
            index = 'z5';
            break;
        case 'today':
            index = 'z6';
            break;
        case '__version__':
        case '_version_':
            index = 'z7';
            break;
        case '_id':
            index = 'z8';
            break;
        case '_uuid':
            index = 'z9';
            break;
        case '_submission_time':
            index = 'z91';
            break;
        default:
          // set index for questions in current version of survey (including questions in groups)
          survey.map(function(x, i) {
            var k = key;
            if (key.includes('/')) {
              var kArray = k.split('/');
              k = kArray[kArray.length - 1];
            }
            if (x.name === k || x.$autoname === k) {
              index = i.toString();
            }
          });
      }

      columns.push({
        Header: h => {
          return _this.getColumnLabel(key, q, qParentG);
        },
        id: key,
        accessor: row => row[key],
        index: index,
        question: q,
        filterable: false,
        Cell: row => {
            if (showLabels && q && q.type && row.value) {
              // show proper labels for choice questions
              if (q.type == 'select_one') {
                let choice = choices.find(o => o.list_name == q.select_from_list_name && (o.name === row.value || o.$autoname == row.value));
                return choice && choice.label && choice.label[translationIndex] ? choice.label[translationIndex] : row.value;
              }
              if (q.type == 'select_multiple' && row.value) {
                let values = row.value.split(" ");
                var labels = [];
                values.forEach(function(v) {
                  let choice = choices.find(o => o.list_name == q.select_from_list_name && (o.name === v || o.$autoname == v));
                  if (choice && choice.label && choice.label[translationIndex])
                    labels.push(choice.label[translationIndex]);
                });

                return labels.join(", ");
              }
              if (q.type == 'start' || q.type == 'end' || q.type == '_submission_time') {
                return formatTimeDate(row.value);
              }
            }
            return typeof(row.value) == "object" ? '' : row.value;
          }
      });

    });

    columns.sort(function(a, b) {
      return a.index.localeCompare(b.index, 'en', {numeric: true});
    })

    let settings = this.props.asset.settings,
        selectedColumns = false,
        frozenColumn = false,
        textFilterQuestionTypes = ['text', 'integer', 'decimal'];

    if (settings['data-table'] && settings['data-table']['frozen-column']) {
      frozenColumn = settings['data-table']['frozen-column'];
    }

    columns.forEach(function(col, ind) {
      // TODO: see if this can work for select_multiple too
      if (col.question && col.question.type === 'select_one') {
        col.filterable = true;
        col.Filter = ({ filter, onChange }) =>
          <select onChange={event => onChange(event.target.value)}
                  style={{ width: "100%" }}
                  value={filter ? filter.value : ""}>
            <option value="">Show All</option>
            {choices.filter(c => c.list_name === col.question.select_from_list_name).map((item, n) => {
              return (
                <option value={item.name} key={n}>{item.label[0]}</option>
              );
            })}
          </select>;
      }
      if (col.question && textFilterQuestionTypes.includes(col.question.type)) {
        col.filterable = true;
        col.Filter = ({ filter, onChange }) =>
          <DebounceInput
            debounceTimeout={750}
            onChange={event => onChange(event.target.value)}
            style={{ width: "100%" }}/>;
      }

      if (frozenColumn === col.id) {
        col.className = col.className ? `frozen ${col.className}` : 'frozen';
        col.headerClassName = 'frozen';
      }
    })

    // prepare list of selected columns, if configured
    if (settings['data-table'] && settings['data-table']['selected-columns']) {
      const selCos = settings['data-table']['selected-columns'];
      selectedColumns = columns.filter((el) => {
        if (el.id == '__SubmissionLinks')
          return true;

        return selCos.includes(el.id) !== false}
      );
    }

    this.setState({
      columns: columns,
      selectedColumns: selectedColumns,
      frozenColumn: frozenColumn
    });

    this.onTableResizeChange(false);
  }
  getColumnLabel(key, q, qParentG) {
    switch(key) {
      case '__SubmissionCheckbox':
        return t('Multi-select checkboxes column');
      case '__ValidationStatus':
        return t('Validation status');
    }

    var label = key;
    let showLabels = this.state.showLabels,
        showGroups = this.state.showGroups,
        translationIndex = this.state.translationIndex,
        survey = this.props.asset.content.survey;

    if (key.includes('/')) {
      var splitK = key.split('/');
      label = splitK[splitK.length - 1];
    }
    if (q && q.label && showLabels && q.label[translationIndex])
      label = q.label[translationIndex];
    // show Groups in labels, when selected
    if (showGroups && qParentG && key.includes('/')) {
      var gLabels = qParentG.join(' / ');

      if (showLabels) {
        var gT = qParentG.map(function(g) {
          var x = survey.find(o => o.name === g || o.$autoname == g);
          if (x && x.label && x.label[translationIndex])
            return x.label[translationIndex];

          return g;
        });
        gLabels = gT.join(' / ');
      }
      return gLabels;
    }

    return label;
  }
  toggleExpandedTable () {
    if (this.state.showExpandedTable) {
      // load asset again to restore header title and submission count after exiting expanded report
      actions.resources.loadAsset({id: this.props.asset.uid});
    }

    stores.pageState.hideDrawerAndHeader(!this.state.showExpandedTable);
    this.setState({
      showExpandedTable: !this.state.showExpandedTable,
    });
  }
  componentDidMount() {
    this.listenTo(actions.resources.updateSubmissionValidationStatus.completed, this.refreshSubmission);
    this.listenTo(actions.table.updateSettings.completed, this.tableSettingsUpdated);
    this.listenTo(stores.pageState, this.onPageStateUpdate);
  }
  componentWillUnmount() {
    if (this.state.showExpandedTable)
      stores.pageState.hideDrawerAndHeader(!this.state.showExpandedTable);
  }
  refreshSubmission(result, sid) {
    if (sid) {
      var subIndex = this.state.tableData.findIndex(x => x._id === parseInt(sid));
      if (typeof subIndex !== "undefined" && this.state.tableData[subIndex]) {
        var newData = this.state.tableData;
        newData[subIndex]._validation_status = result;
        this.setState({tableData: newData});
        this._prepColumns(newData);
      }
    }
  }
  tableSettingsUpdated() {
    stores.pageState.hideModal();
    this.refreshTable();
  }
  launchPrinting () {
    window.print();
  }
  fetchData(state, instance) {
    this.setState({
      loading: true,
      pageSize: instance.state.pageSize,
      currentPage: instance.state.page,
      fetchState: state,
      fetchInstance: instance
    });
    this.requestData(instance);
  }
  launchSubmissionModal (evt) {
    let el = $(evt.target).closest('[data-sid]').get(0);
    const sid = el.getAttribute('data-sid');

    this.submissionModalProcessing(sid, this.state.tableData);
  }
  submissionModalProcessing(sid, tableData) {
    let ids = [];

    tableData.forEach(function(r) {
      ids.push(r._id);
    })

    stores.pageState.showModal({
      type: 'submission',
      sid: sid,
      asset: this.props.asset,
      ids: ids,
      tableInfo: {
        currentPage: this.state.currentPage,
        pageSize: this.state.pageSize,
        resultsTotal: this.state.resultsTotal
      }
    });
  }
  launchTableColumnsModal () {
    stores.pageState.showModal({
      type: 'table-columns',
      settings: this.props.asset.settings,
      columns: this.state.columns,
      uid: this.props.asset.uid,
      getColumnLabel: this.getColumnLabel
    });
  }
  launchEditSubmission (evt) {
    let el = $(evt.target).closest('[data-sid]').get(0),
        uid = this.props.asset.uid,
        newWin = window.open('', '_blank');
    const sid = el.getAttribute('data-sid');

    dataInterface.getEnketoEditLink(uid, sid).done((editData) => {
      this.setState({ promptRefresh: true });
      if (editData.url) {
        newWin.location = editData.url;
      } else {
        newWin.close();
        notify(t('There was an error loading Enketo.'));
      }
    });
  }
  onPageStateUpdate(pageState) {
    if (!pageState.modal)
      return false;

    let params = pageState.modal,
        page = 0;
    if(!params.sid) {
      let fetchInstance = this.state.fetchInstance;
      if (params.page == 'next')
        page = this.state.currentPage + 1;
      if (params.page == 'prev')
        page = this.state.currentPage - 1;

      fetchInstance.setState({ page: page });
      this.setState({
        fetchInstance: fetchInstance,
        submissionPager: params.page
      }, function() {
        this.fetchData(this.state.fetchState, this.state.fetchInstance);
      });
    }

  }
  refreshTable() {
    this.fetchData(this.state.fetchState, this.state.fetchInstance);
    this.setState({ promptRefresh: false });
  }
  clearPromptRefresh() {
    this.setState({ promptRefresh: false });
  }
  bulkUpdateChange(evt) {
    const sid = evt.target.getAttribute('data-sid');
    var selectedRows = this.state.selectedRows;

    if (evt.target.checked) {
      selectedRows[sid] = true;
    } else {
      delete selectedRows[sid];
    }

    this.setState({
      selectedRows: selectedRows,
      selectAll: false
    });
  }
  bulkSelectAllRows(evt) {
    var s = this.state.selectedRows,
        selectAll = this.state.selectAll;

    this.state.tableData.forEach(function(r) {
      if (evt.target.checked) {
        s[r._id] = true;
      } else {
        delete s[r._id];
      }
    })

    this.setState({
      selectedRows: s,
      selectAll: false
    });
  }
  bulkUpdateStatus(evt) {
    const val = evt.target.getAttribute('data-value'),
          selectAll = this.state.selectAll;
    var d = null;

    if (!selectAll) {
      d = {
        submissions_ids: Object.keys(this.state.selectedRows),
        "validation_status.uid": val
      };
    } else {
      const f = this.state.fetchState.filtered;
      if (f.length) {
        d = {
          query: {},
          "validation_status.uid": val
        };
        f.forEach(function(z) {
          d.query[z.id] = z.value;
        });
      } else {
        d = {
          confirm: true,
          "validation_status.uid": val
        };
      }
    }

    let dialog = alertify.dialog('confirm');
    const sel = this.state.selectAll ? this.state.resultsTotal : Object.keys(this.state.selectedRows).length;
    let opts = {
      title: t('Update status of selected submissions'),
      message: t('You have selected ## submissions. Are you sure you would like to update their status? This action is irreversible.').replace('##', sel),
      labels: {ok: t('Update Validation Status'), cancel: t('Cancel')},
      onok: (evt, val) => {
        dataInterface.patchSubmissions(this.props.asset.uid, d).done((res) => {
          this.fetchData(this.state.fetchState, this.state.fetchInstance);
          this.setState({loading: true});
        }).fail((jqxhr)=> {
          console.error(jqxhr);
          alertify.error(t('Failed to update status.'));
        });
      },
      oncancel: () => {
        dialog.destroy();
      }
    };
    dialog.set(opts).show();
  }
  showXMLValues() {
    this.setState({
      showLabels: false
    });

    window.setTimeout(()=>{
      this._prepColumns(this.state.tableData);
    }, 200);
  }
  showTranslation(evt) {
    const index = evt.target.getAttribute('data-index');
    this.setState({
      showLabels: true,
      translationIndex: index
    });

    window.setTimeout(()=>{
      this._prepColumns(this.state.tableData);
    }, 200);
  }
  toggleGroups () {
    this.setState({
      showGroups: !this.state.showGroups
    });

    window.setTimeout(()=>{
      this._prepColumns(this.state.tableData);
    }, 200);
  }
  bulkSelectAll() {
    this.setState({selectAll: true});
  }
  clearSelection() {
    this.setState({selectAll: false, selectedRows: {}});
  }
  bulkSelectUI() {
    if (!this.state.tableData.length) {
      return false;
    }

    const { pageSize, currentPage, resultsTotal } = this.state;

    const pages = Math.floor(((resultsTotal - 1) / pageSize) + 1),
          res1 = (currentPage * pageSize) + 1,
          res2 = Math.min((currentPage + 1) * pageSize, resultsTotal),
          showingResults = `${res1} - ${res2} ${t('of')} ${resultsTotal} ${t('results')}. `,
          selected = this.state.selectedRows,
          maxPageRes = Math.min(this.state.pageSize, this.state.tableData.length);;

          //
    return (
      <bem.FormView__item m='table-meta'>
        {showingResults}
        {this.state.selectAll ?
          <span>
            {t('All ## selected. ').replace('##', resultsTotal)}
            <a className="select-all" onClick={this.clearSelection}>
              {t('Clear selection')}
            </a>
          </span>
        :
          <span>
            {Object.keys(selected).length > 0 &&
              t('## selected. ').replace('##', Object.keys(selected).length)
            }
            {Object.keys(selected).length == maxPageRes && resultsTotal > pageSize &&
              <a className="select-all" onClick={this.bulkSelectAll}>
                {t('Select all ##').replace('##', resultsTotal)}
              </a>
            }
          </span>
        }
      </bem.FormView__item>
    );
  }
  onTableResizeChange(params) {
    let frozenCol = this.state.frozenColumn,
        padLeft = 0;

    if (frozenCol) {
      if (params && params[0].id === frozenCol) {
        padLeft = params[0].value;
      } else {
        padLeft = $('.ReactTable .rt-th.frozen').width() + 10;
      }

      $('.ReactTable .rt-tr').css('padding-left', padLeft + 10);
    }
  }
  render () {
    if (this.state.error) {
      return (
        <ui.Panel>
          <bem.Loading>
            <bem.Loading__inner>
              {this.state.error}
            </bem.Loading__inner>
          </bem.Loading>
        </ui.Panel>
        )
    }

    const { tableData, columns, selectedColumns, defaultPageSize, loading, pageSize, currentPage, resultsTotal } = this.state;
    const pages = Math.floor(((resultsTotal - 1) / pageSize) + 1);
    let asset = this.props.asset,
        tableClasses = this.state.frozenColumn ? '-striped -highlight has-frozen-column' : '-striped -highlight';

    return (
      <bem.FormView m='table'>
        {this.state.promptRefresh &&
          <bem.FormView__cell m='table-warning'>
            <i className="k-icon-alert" />
            {t('The data below may be out of date. ')}
            <a className="select-all" onClick={this.refreshTable}>
              {t('Refresh')}
            </a>

            <i className="k-icon-close" onClick={this.clearPromptRefresh} />
          </bem.FormView__cell>
        }
        <bem.FormView__group m={['table-header', this.state.loading ? 'table-loading' : 'table-loaded']}>
          {this.bulkSelectUI()}
          <bem.FormView__item m='table-buttons'>
            <button className="mdl-button mdl-button--icon report-button__print is-edge"
                    onClick={this.launchPrinting}
                    data-tip={t('Print')}>
              <i className="k-icon-print" />
            </button>

            {Object.keys(this.state.selectedRows).length > 0 &&
              <ui.PopoverMenu type='bulkUpdate-menu' triggerLabel={t('Update selected')} >
                <bem.PopoverMenu__heading>
                  {t('Updated status to:')}
                </bem.PopoverMenu__heading>
                {VALIDATION_STATUSES.map((item, n) => {
                  return (
                    <bem.PopoverMenu__link onClick={this.bulkUpdateStatus} data-value={item.value} key={n}>
                      {item.label}
                      </bem.PopoverMenu__link>
                  );
                })}
              </ui.PopoverMenu>
            }

            <button className="mdl-button mdl-button--icon report-button__expand"
                    onClick={this.toggleExpandedTable}
                    data-tip={this.state.showExpandedTable ? t('Contract') : t('Expand')}>
              <i className="k-icon-expand" />
            </button>

            <ui.PopoverMenu type='formTable-menu'
                        triggerLabel={<i className="k-icon-more" />}
                        triggerTip={t('Display options')}>
                <bem.PopoverMenu__item m='currently'>
                  <span>{t('Showing:')}</span>
                  {this.state.selectedColumns ?
                    <span>{t('Selected columns')}</span>
                    :
                    <span>{t('All columns')}</span>
                  }
                </bem.PopoverMenu__item>

                {this.userCan('change_submissions', this.props.asset) &&
                  <bem.PopoverMenu__link
                    onClick={this.launchTableColumnsModal}>
                    {t('Show/hide table columns')}
                  </bem.PopoverMenu__link>
                }
                <bem.PopoverMenu__item m='currently'>
                  <span>{t('Showing:')}</span>
                  {this.state.showLabels ?
                    <span>
                      {t('Labels')}&nbsp;
                      {asset.content.translations.length > 1 &&
                        ` - ${asset.content.translations[this.state.translationIndex]}`
                      }
                    </span>
                  :
                    <span>{t('XML Values')}</span>
                  }
                </bem.PopoverMenu__item>

                {this.state.showLabels &&
                  <bem.PopoverMenu__link onClick={this.showXMLValues}>
                    {t('Show XML values')}
                  </bem.PopoverMenu__link>
                }
                {asset.content.translations.map((trns, n) => {
                    return (
                      <bem.PopoverMenu__link
                        onClick={this.showTranslation} data-index={n} key={n}
                        className={this.state.showLabels && this.state.translationIndex == n ? 'hidden': ''}>
                        {t('Show labels')}
                        {trns ? ` - ${trns}` : null}
                      </bem.PopoverMenu__link>
                    )
                })}
                <bem.PopoverMenu__item m='currently'>
                  <span>{t('Showing:')}</span>
                  {this.state.showGroups ?
                    <span>{t('Groups in headings')}</span>
                  :
                    <span>{t('No groups in headings')}</span>
                  }
                </bem.PopoverMenu__item>

                {this.state.showGroups ?
                  <bem.PopoverMenu__link onClick={this.toggleGroups} className="divider">
                    {t('Hide groups in headings')}
                  </bem.PopoverMenu__link>
                :
                  <bem.PopoverMenu__link onClick={this.toggleGroups} className="divider">
                    {t('Show groups in headings')}
                  </bem.PopoverMenu__link>
                }
            </ui.PopoverMenu>

          </bem.FormView__item>
        </bem.FormView__group>

        <ReactTable
          data={tableData}
          columns={selectedColumns || columns}
          defaultPageSize={defaultPageSize}
          pageSizeOptions={[10, 30, 50, 100, 200, 500]}
          minRows={1}
          className={tableClasses}
          pages={pages}
          manual
          onFetchData={this.fetchData}
          onResizedChange={_.debounce(this.onTableResizeChange, 10)}
          loading={loading}
          previousText={t('Prev')}
          nextText={t('Next')}
          loadingText={
            <span>
              <i className="fa k-spin fa-circle-o-notch" />
              {t('Loading...')}
            </span>
          }
          noDataText={t('No rows found')} // TODO: fix display
          pageText={t('Page')}
          ofText={t('of')}
          rowsText={t('rows')}
          getTableProps={() => {
            return {
              onScroll: (e) => {
                if (this.state.frozenColumn) {
                  if (this.tableScrollTop === e.target.scrollTop) {
                    let left = e.target.scrollLeft > 0 ? e.target.scrollLeft - 12 : e.target.scrollLeft;
                    $('.ReactTable .rt-tr .frozen').css({left: left});
                  } else {
                    this.tableScrollTop = e.target.scrollTop;
                  }
                }
              }
            };
          }}
          filterable/>
      </bem.FormView>
    );
  }
};

reactMixin(DataTable.prototype, Reflux.ListenerMixin);
reactMixin(DataTable.prototype, mixins.permissions);

export default DataTable;
