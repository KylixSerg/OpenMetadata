/*
 *  Copyright 2022 Collate.
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

import { Alert, Badge, Button, Dropdown, InputRef, Typography } from 'antd';
import { Header } from 'antd/lib/layout/layout';
import { AxiosError } from 'axios';
import { CookieStorage } from 'cookie-storage';
import i18next from 'i18next';
import { startCase, upperCase } from 'lodash';
import { MenuInfo } from 'rc-menu/lib/interface';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useHistory } from 'react-router-dom';
import { ReactComponent as DropDownIcon } from '../../assets/svg/drop-down.svg';
import { ReactComponent as IconBell } from '../../assets/svg/ic-alert-bell.svg';
import { ReactComponent as DomainIcon } from '../../assets/svg/ic-domain.svg';
import { ReactComponent as Help } from '../../assets/svg/ic-help.svg';
import { ReactComponent as RefreshIcon } from '../../assets/svg/ic-refresh.svg';
import {
  NOTIFICATION_READ_TIMER,
  SOCKET_EVENTS,
} from '../../constants/constants';
import { GlobalSettingsMenuCategory } from '../../constants/GlobalSettings.constants';
import { HELP_ITEMS_ENUM } from '../../constants/Navbar.constants';
import { useAsyncDeleteProvider } from '../../context/AsyncDeleteProvider/AsyncDeleteProvider';
import { AsyncDeleteWebsocketResponse } from '../../context/AsyncDeleteProvider/AsyncDeleteProvider.interface';
import { useTourProvider } from '../../context/TourProvider/TourProvider';
import { useWebSocketConnector } from '../../context/WebSocketProvider/WebSocketProvider';
import { EntityTabs, EntityType } from '../../enums/entity.enum';
import { EntityReference } from '../../generated/entity/type';
import { BackgroundJob, JobType } from '../../generated/jobs/backgroundJob';
import useCustomLocation from '../../hooks/useCustomLocation/useCustomLocation';
import { useDomainStore } from '../../hooks/useDomainStore';
import { getVersion } from '../../rest/miscAPI';
import { isProtectedRoute } from '../../utils/AuthProvider.util';
import brandClassBase from '../../utils/BrandData/BrandClassBase';
import {
  hasNotificationPermission,
  shouldRequestPermission,
} from '../../utils/BrowserNotificationUtils';
import { refreshPage } from '../../utils/CommonUtils';
import { getCustomPropertyEntityPathname } from '../../utils/CustomProperty.utils';
import entityUtilClassBase from '../../utils/EntityUtilClassBase';
import { getEntityName } from '../../utils/EntityUtils';
import {
  getEntityFQN,
  getEntityType,
  prepareFeedLink,
} from '../../utils/FeedUtils';
import {
  languageSelectOptions,
  SupportedLocales,
} from '../../utils/i18next/i18nextUtil';
import { isCommandKeyPress, Keys } from '../../utils/KeyboardUtil';
import { getHelpDropdownItems } from '../../utils/NavbarUtils';
import { getSettingPath } from '../../utils/RouterUtils';
import { showErrorToast } from '../../utils/ToastUtils';
import { ActivityFeedTabs } from '../ActivityFeed/ActivityFeedTab/ActivityFeedTab.interface';
import DomainSelectableList from '../common/DomainSelectableList/DomainSelectableList.component';
import { useEntityExportModalProvider } from '../Entity/EntityExportModalProvider/EntityExportModalProvider.component';
import { CSVExportWebsocketResponse } from '../Entity/EntityExportModalProvider/EntityExportModalProvider.interface';
import { GlobalSearchBar } from '../GlobalSearchBar/GlobalSearchBar';
import WhatsNewModal from '../Modals/WhatsNewModal/WhatsNewModal';
import NotificationBox from '../NotificationBox/NotificationBox.component';
import { UserProfileIcon } from '../Settings/Users/UserProfileIcon/UserProfileIcon.component';
import './nav-bar.less';
import popupAlertsCardsClassBase from './PopupAlertClassBase';

const cookieStorage = new CookieStorage();

const NavBar: React.FC = () => {
  const { isTourOpen: isTourRoute } = useTourProvider();
  const { onUpdateCSVExportJob } = useEntityExportModalProvider();
  const { handleDeleteEntityWebsocketResponse } = useAsyncDeleteProvider();
  const Logo = useMemo(() => brandClassBase.getMonogram().src, []);
  const [showVersionMissMatchAlert, setShowVersionMissMatchAlert] =
    useState(false);
  const location = useCustomLocation();
  const history = useHistory();
  const { activeDomain, activeDomainEntityRef, updateActiveDomain } =
    useDomainStore();
  const { t } = useTranslation();
  const searchRef = useRef<InputRef>(null);
  const [hasTaskNotification, setHasTaskNotification] =
    useState<boolean>(false);
  const [hasMentionNotification, setHasMentionNotification] =
    useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('Task');
  const [isFeatureModalOpen, setIsFeatureModalOpen] = useState<boolean>(false);
  const [version, setVersion] = useState<string>();
  const [isDomainDropdownOpen, setIsDomainDropdownOpen] = useState(false);

  const fetchOMVersion = async () => {
    try {
      const res = await getVersion();
      setVersion(res.version);
    } catch (err) {
      showErrorToast(
        err as AxiosError,
        t('server.entity-fetch-error', {
          entity: t('label.version'),
        })
      );
    }
  };

  const renderAlertCards = useMemo(() => {
    const cardList = popupAlertsCardsClassBase.alertsCards();

    return cardList.map(({ key, component }) => {
      const Component = component;

      return <Component key={key} />;
    });
  }, []);

  const handleSupportClick = ({ key }: MenuInfo): void => {
    if (key === HELP_ITEMS_ENUM.WHATS_NEW) {
      setIsFeatureModalOpen(true);
    }
  };

  const language = useMemo(
    () =>
      (cookieStorage.getItem('i18next') as SupportedLocales) ||
      SupportedLocales.English,
    []
  );

  const { socket } = useWebSocketConnector();

  const handleTaskNotificationRead = () => {
    setHasTaskNotification(false);
  };

  const handleMentionsNotificationRead = () => {
    setHasMentionNotification(false);
  };

  const handleBellClick = useCallback(
    (visible: boolean) => {
      if (visible) {
        switch (activeTab) {
          case 'Task':
            hasTaskNotification &&
              setTimeout(() => {
                handleTaskNotificationRead();
              }, NOTIFICATION_READ_TIMER);

            break;

          case 'Conversation':
            hasMentionNotification &&
              setTimeout(() => {
                handleMentionsNotificationRead();
              }, NOTIFICATION_READ_TIMER);

            break;
        }
      }
    },
    [hasTaskNotification]
  );

  const handleActiveTab = (key: string) => {
    setActiveTab(key);
  };

  const showBrowserNotification = (
    about: string,
    createdBy: string,
    type: string,
    backgroundJobData?: BackgroundJob
  ) => {
    if (!hasNotificationPermission()) {
      return;
    }

    const entityType = getEntityType(about);
    const entityFQN = getEntityFQN(about) ?? '';
    let body;
    let path: string;

    switch (type) {
      case 'Task':
        body = t('message.user-assign-new-task', {
          user: createdBy,
        });

        path = entityUtilClassBase.getEntityLink(
          entityType as EntityType,
          entityFQN,
          EntityTabs.ACTIVITY_FEED,
          ActivityFeedTabs.TASKS
        );

        break;
      case 'Conversation':
        body = t('message.user-mentioned-in-comment', {
          user: createdBy,
        });
        path = prepareFeedLink(entityType as string, entityFQN as string);

        break;

      case 'BackgroundJob': {
        if (!backgroundJobData) {
          break;
        }

        const { jobArgs, status, jobType } = backgroundJobData;

        if (jobType === JobType.CustomPropertyEnumCleanup) {
          body = t('message.custom-property-update', {
            propertyName: jobArgs.propertyName,
            entityName: jobArgs.entityType,
            status: startCase(status.toLowerCase()),
          });

          path = getSettingPath(
            GlobalSettingsMenuCategory.CUSTOM_PROPERTIES,
            getCustomPropertyEntityPathname(jobArgs.entityType)
          );
        }

        break;
      }
    }
    const notification = new Notification('Notification From OpenMetadata', {
      body: body,
      icon: Logo,
    });
    notification.onclick = () => {
      const isChrome = window.navigator.userAgent.indexOf('Chrome');
      // Applying logic to open a new window onclick of browser notification from chrome
      // As it does not open the concerned tab by default.
      if (isChrome > -1) {
        window.open(path);
      } else {
        history.push(path);
      }
    };
  };

  const handleKeyPress = useCallback((event) => {
    if (isCommandKeyPress(event) && event.key === Keys.K) {
      searchRef.current?.focus();
      event.preventDefault();
    }
  }, []);

  useEffect(() => {
    if (shouldRequestPermission()) {
      Notification.requestPermission();
    }

    const handleDocumentVisibilityChange = async () => {
      if (isProtectedRoute(location.pathname) && isTourRoute) {
        return;
      }
      const newVersion = await getVersion();
      // Compare version only if version is set previously to have fair comparison
      if (version && version !== newVersion.version) {
        setShowVersionMissMatchAlert(true);
      }
    };

    addEventListener('focus', handleDocumentVisibilityChange);

    return () => {
      removeEventListener('focus', handleDocumentVisibilityChange);
    };
  }, [isTourRoute, version]);

  useEffect(() => {
    if (socket) {
      socket.on(SOCKET_EVENTS.TASK_CHANNEL, (newActivity) => {
        if (newActivity) {
          const activity = JSON.parse(newActivity);
          setHasTaskNotification(true);
          showBrowserNotification(
            activity.about,
            activity.createdBy,
            activity.type
          );
        }
      });

      socket.on(SOCKET_EVENTS.MENTION_CHANNEL, (newActivity) => {
        if (newActivity) {
          const activity = JSON.parse(newActivity);
          setHasMentionNotification(true);
          showBrowserNotification(
            activity.about,
            activity.createdBy,
            activity.type
          );
        }
      });

      socket.on(SOCKET_EVENTS.CSV_EXPORT_CHANNEL, (exportResponse) => {
        if (exportResponse) {
          const exportResponseData = JSON.parse(
            exportResponse
          ) as CSVExportWebsocketResponse;

          onUpdateCSVExportJob(exportResponseData);
        }
      });
      socket.on(SOCKET_EVENTS.BACKGROUND_JOB_CHANNEL, (jobResponse) => {
        if (jobResponse) {
          const jobResponseData: BackgroundJob = JSON.parse(jobResponse);
          showBrowserNotification(
            '',
            jobResponseData.createdBy,
            'BackgroundJob',
            jobResponseData
          );
        }
      });

      socket.on(SOCKET_EVENTS.DELETE_ENTITY_CHANNEL, (deleteResponse) => {
        if (deleteResponse) {
          const deleteResponseData = JSON.parse(
            deleteResponse
          ) as AsyncDeleteWebsocketResponse;
          handleDeleteEntityWebsocketResponse(deleteResponseData);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off(SOCKET_EVENTS.TASK_CHANNEL);
        socket.off(SOCKET_EVENTS.MENTION_CHANNEL);
        socket.off(SOCKET_EVENTS.CSV_EXPORT_CHANNEL);
        socket.off(SOCKET_EVENTS.BACKGROUND_JOB_CHANNEL);
        socket.off(SOCKET_EVENTS.DELETE_ENTITY_CHANNEL);
      }
    };
  }, [socket, onUpdateCSVExportJob]);

  useEffect(() => {
    fetchOMVersion();
  }, []);

  useEffect(() => {
    const targetNode = document.body;
    targetNode.addEventListener('keydown', handleKeyPress);

    return () => targetNode.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  const handleDomainChange = useCallback(
    async (domain: EntityReference | EntityReference[]) => {
      updateActiveDomain(domain as EntityReference);
      setIsDomainDropdownOpen(false);
      refreshPage();
    },
    []
  );

  const handleLanguageChange = useCallback(({ key }) => {
    i18next.changeLanguage(key);
    refreshPage();
  }, []);

  const handleModalCancel = useCallback(() => setIsFeatureModalOpen(false), []);

  return (
    <>
      <Header>
        <div className="navbar-container">
          <GlobalSearchBar />

          <div className="flex-center gap-5 nav-bar-side-items">
            <DomainSelectableList
              hasPermission
              popoverProps={{
                open: isDomainDropdownOpen,
                onOpenChange: (open) => {
                  setIsDomainDropdownOpen(open);
                },
              }}
              selectedDomain={activeDomainEntityRef}
              onCancel={() => setIsDomainDropdownOpen(false)}
              onUpdate={handleDomainChange}>
              <Button
                className="flex-center gap-2 p-0 font-medium"
                data-testid="domain-dropdown"
                type="text"
                onClick={() => setIsDomainDropdownOpen(!isDomainDropdownOpen)}>
                <DomainIcon
                  className="d-flex text-base-color"
                  height={24}
                  name="domain"
                  width={24}
                />
                <Typography.Text className="font-medium">
                  {activeDomainEntityRef
                    ? getEntityName(activeDomainEntityRef)
                    : activeDomain}
                </Typography.Text>

                <DropDownIcon width={20} />
              </Button>
            </DomainSelectableList>

            <Dropdown
              className="cursor-pointer"
              menu={{
                items: languageSelectOptions,
                onClick: handleLanguageChange,
              }}
              placement="bottomRight"
              trigger={['click']}>
              <Button className="flex-center gap-2 p-0 font-medium" type="text">
                {upperCase(
                  (language || SupportedLocales.English).split('-')[0]
                )}{' '}
                <DropDownIcon width={20} />
              </Button>
            </Dropdown>
            <Dropdown
              destroyPopupOnHide
              className="cursor-pointer"
              dropdownRender={() => (
                <NotificationBox
                  hasMentionNotification={hasMentionNotification}
                  hasTaskNotification={hasTaskNotification}
                  onMarkMentionsNotificationRead={
                    handleMentionsNotificationRead
                  }
                  onMarkTaskNotificationRead={handleTaskNotificationRead}
                  onTabChange={handleActiveTab}
                />
              )}
              overlayStyle={{
                width: '425px',
                minHeight: '375px',
              }}
              placement="bottomRight"
              trigger={['click']}
              onOpenChange={handleBellClick}>
              <Button
                className="flex-center p-sm"
                icon={
                  <Badge
                    dot={hasTaskNotification || hasMentionNotification}
                    offset={[-3, 3]}>
                    <IconBell data-testid="task-notifications" width={20} />
                  </Badge>
                }
                size="large"
                title={t('label.notification-plural')}
                type="text"
              />
            </Dropdown>
            <Dropdown
              menu={{
                items: getHelpDropdownItems(version),
                onClick: handleSupportClick,
              }}
              overlayStyle={{ width: 175 }}
              placement="bottomRight"
              trigger={['click']}>
              <Button
                className="flex-center p-sm"
                data-testid="help-icon"
                icon={<Help width={20} />}
                size="large"
                title={t('label.need-help')}
                type="text"
              />
            </Dropdown>
            <UserProfileIcon />
          </div>
        </div>
      </Header>
      <WhatsNewModal
        header={`${t('label.whats-new')}!`}
        visible={isFeatureModalOpen}
        onCancel={handleModalCancel}
      />

      {showVersionMissMatchAlert && (
        <Alert
          showIcon
          action={
            <Button
              size="small"
              type="link"
              onClick={() => {
                history.go(0);
              }}>
              {t('label.refresh')}
            </Button>
          }
          className="refresh-alert slide-in-top"
          description="For a seamless experience recommend you to refresh the page"
          icon={<RefreshIcon />}
          message="A new version is available"
          type="info"
        />
      )}
      {renderAlertCards}
    </>
  );
};

export default NavBar;
