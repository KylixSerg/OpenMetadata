/*
 *  Copyright 2024 Collate.
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *  http://www.apache.org/licenses/LICENSE-2.0
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */
import { ReactComponent as TestCaseIcon } from '../../assets/svg/all-activity-v2.svg';
import { ReactComponent as TableIcon } from '../../assets/svg/ic-table.svg';
import { ReactComponent as TestSuiteIcon } from '../../assets/svg/icon-test-suite.svg';
import { TestCases } from '../../components/DataQuality/TestCases/TestCases.component';
import { TestSuites } from '../../components/DataQuality/TestSuite/TestSuiteList/TestSuites.component';
import i18n from '../../utils/i18next/LocalUtil';
import { getDataQualityPagePath } from '../../utils/RouterUtils';
import { DataQualityPageTabs } from './DataQualityPage.interface';

export type DataQualityLeftSideBarType = {
  key: DataQualityPageTabs;
  id: string;
  label: string;
  description: string;
  icon: SvgComponent;
  iconProps: React.SVGProps<SVGSVGElement>;
};

class DataQualityClassBase {
  public getLeftSideBar(): DataQualityLeftSideBarType[] {
    return [
      {
        key: DataQualityPageTabs.TABLES,
        id: 'by-tables',
        label: i18n.t('label.by-entity', {
          entity: i18n.t('label.table-plural'),
        }),
        icon: TableIcon,
        description: i18n.t('label.review-data-entity', {
          entity: i18n.t('label.by-entity', {
            entity: i18n.t('label.table-plural'),
          }),
        }),
        iconProps: {
          className: 'side-panel-icons',
        },
      },
      {
        key: DataQualityPageTabs.TEST_CASES,
        label: i18n.t('label.by-entity', {
          entity: i18n.t('label.test-case-plural'),
        }),
        id: 'by-test-cases',
        description: i18n.t('label.review-data-entity', {
          entity: i18n.t('label.by-entity', {
            entity: i18n.t('label.test-case-plural'),
          }),
        }),
        icon: TestCaseIcon,
        iconProps: {
          className: 'side-panel-icons',
        },
      },
      {
        key: DataQualityPageTabs.TEST_SUITES,
        label: i18n.t('label.by-entity', {
          entity: i18n.t('label.test-suite-plural'),
        }),
        description: i18n.t('label.review-data-entity', {
          entity: i18n.t('label.by-entity', {
            entity: i18n.t('label.test-suite-plural'),
          }),
        }),
        id: 'by-test-suites',
        icon: TestSuiteIcon,
        iconProps: {
          className: 'side-panel-icons',
        },
      },
    ];
  }

  public getDataQualityTab() {
    return [
      {
        component: TestSuites,
        key: DataQualityPageTabs.TABLES,
        path: getDataQualityPagePath(DataQualityPageTabs.TABLES),
      },
      {
        key: DataQualityPageTabs.TEST_CASES,
        component: TestCases,
        path: getDataQualityPagePath(DataQualityPageTabs.TEST_CASES),
      },
      {
        key: DataQualityPageTabs.TEST_SUITES,
        component: TestSuites,
        path: getDataQualityPagePath(DataQualityPageTabs.TEST_SUITES),
      },
    ];
  }

  public getDefaultActiveTab(): DataQualityPageTabs {
    return DataQualityPageTabs.TABLES;
  }
}

const dataQualityClassBase = new DataQualityClassBase();

export default dataQualityClassBase;
export { DataQualityClassBase };