import { IEditorOverrideServices } from 'vs/editor/standalone/browser/standaloneServices'
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors'
import { IUserDataAutoSyncService, IUserDataSyncEnablementService, IUserDataSyncLocalStoreService, IUserDataSyncLogService, IUserDataSyncResourceProviderService, IUserDataSyncService, IUserDataSyncStoreManagementService, IUserDataSyncStoreService, IUserDataSyncUtilService } from 'vs/platform/userDataSync/common/userDataSync.service'
import { UserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount'
import { IUserDataSyncAccountService } from 'vs/platform/userDataSync/common/userDataSyncAccount.service'
import { UserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines'
import { IUserDataSyncMachinesService } from 'vs/platform/userDataSync/common/userDataSyncMachines.service'
import { UserDataSyncStoreManagementService, UserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSyncStoreService'
import { UserDataAutoSyncService } from 'vs/platform/userDataSync/common/userDataAutoSyncService'
import { WebUserDataSyncEnablementService } from 'vs/workbench/services/userDataSync/browser/webUserDataSyncEnablementService'
import { UserDataSyncService } from 'vs/platform/userDataSync/common/userDataSyncService'
import { UserDataSyncLogService } from 'vs/platform/userDataSync/common/userDataSyncLog'
import { BrowserUserDataProfilesService } from 'vs/platform/userDataProfile/browser/userDataProfile'
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile.service'
import { UserDataSyncResourceProviderService } from 'vs/platform/userDataSync/common/userDataSyncResourceProvider'
import { UserDataSyncLocalStoreService } from 'vs/platform/userDataSync/common/userDataSyncLocalStoreService'
import { UserDataSyncWorkbenchService } from 'vs/workbench/services/userDataSync/browser/userDataSyncWorkbenchService'
import { IUserDataSyncWorkbenchService } from 'vs/workbench/services/userDataSync/common/userDataSync.service'
import 'vs/workbench/contrib/userDataSync/browser/userDataSync.contribution'
import { IUserDataInitializer, UserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit'
import { IUserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit.service'
import { UserDataSyncInitializer } from 'vs/workbench/services/userDataSync/browser/userDataSyncInit'
import { UserDataProfileInitializer } from 'vs/workbench/services/userDataProfile/browser/userDataProfileInit'
import { IBrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService.service'
import { ISecretStorageService } from 'vs/platform/secrets/common/secrets.service'
import { IFileService } from 'vs/platform/files/common/files.service'
import { IStorageService } from 'vs/platform/storage/common/storage.service'
import { IProductService } from 'vs/platform/product/common/productService.service'
import { IRequestService } from 'vs/platform/request/common/request.service'
import { ILogService } from 'vs/platform/log/common/log.service'
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity.service'
import { IUserDataProfileImportExportService, IUserDataProfileManagementService, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile.service'
import { mark } from 'vs/base/common/performance'
import type { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService'
import { timeout } from 'vs/base/common/async'
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration.service'
import { UserDataSyncUtilService } from 'vs/workbench/services/userDataSync/common/userDataSyncUtil'
import { UserDataProfileImportExportService } from 'vs/workbench/services/userDataProfile/browser/userDataProfileImportExportService'
import { UserDataProfileManagementService } from 'vs/workbench/services/userDataProfile/browser/userDataProfileManagement'
import { registerServiceInitializePostParticipant } from '../lifecycle'

function isWorkspaceService (configurationService: IWorkbenchConfigurationService): configurationService is WorkspaceService {
  return 'reloadLocalUserConfiguration' in configurationService
}

async function initializeUserData (userDataInitializationService: UserDataInitializationService, configurationService: IWorkbenchConfigurationService) {
  if (await userDataInitializationService.requiresInitialization()) {
    mark('code/willInitRequiredUserData')

    // Initialize required resources - settings & global state
    await userDataInitializationService.initializeRequiredResources()

    // Important: Reload only local user configuration after initializing
    // Reloading complete configuration blocks workbench until remote configuration is loaded.
    if (isWorkspaceService(configurationService)) {
      await configurationService.reloadLocalUserConfiguration()
    }

    mark('code/didInitRequiredUserData')
  }
}

registerServiceInitializePostParticipant(async accessor => {
  try {
    await Promise.race([
      // Do not block more than 5s
      timeout(5000),
      initializeUserData(accessor.get(IUserDataInitializationService) as UserDataInitializationService, accessor.get(IWorkbenchConfigurationService))]
    )
  } catch (error) {
    accessor.get(ILogService).error(error as Error)
  }
})

class InjectedUserDataInitializationService extends UserDataInitializationService {
  constructor (
    @IBrowserWorkbenchEnvironmentService environmentService: IBrowserWorkbenchEnvironmentService,
    @ISecretStorageService secretStorageService: ISecretStorageService,
    @IUserDataSyncStoreManagementService userDataSyncStoreManagementService: IUserDataSyncStoreManagementService,
    @IFileService fileService: IFileService,
    @IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
    @IStorageService storageService: IStorageService,
    @IProductService productService: IProductService,
    @IRequestService requestService: IRequestService,
    @ILogService logService: ILogService,
    @IUriIdentityService uriIdentityService: IUriIdentityService,
    @IUserDataProfileService userDataProfileService: IUserDataProfileService
  ) {
    const userDataInitializers: IUserDataInitializer[] = []
    userDataInitializers.push(new UserDataSyncInitializer(environmentService, secretStorageService, userDataSyncStoreManagementService, fileService, userDataProfilesService, storageService, productService, requestService, logService, uriIdentityService))
    if (environmentService.options?.profile != null) {
      userDataInitializers.push(new UserDataProfileInitializer(environmentService, fileService, userDataProfileService, storageService, logService, uriIdentityService, requestService))
    }

    super(userDataInitializers)
  }
}

export default function getServiceOverride (): IEditorOverrideServices {
  return {
    [IUserDataAutoSyncService.toString()]: new SyncDescriptor(UserDataAutoSyncService, [], true),
    [IUserDataSyncStoreManagementService.toString()]: new SyncDescriptor(UserDataSyncStoreManagementService, [], true),
    [IUserDataSyncStoreService.toString()]: new SyncDescriptor(UserDataSyncStoreService, [], true),
    [IUserDataSyncEnablementService.toString()]: new SyncDescriptor(WebUserDataSyncEnablementService, [], true),
    [IUserDataSyncService.toString()]: new SyncDescriptor(UserDataSyncService, [], true),
    [IUserDataSyncLogService.toString()]: new SyncDescriptor(UserDataSyncLogService, [], true),
    [IUserDataSyncAccountService.toString()]: new SyncDescriptor(UserDataSyncAccountService, [], true),
    [IUserDataSyncMachinesService.toString()]: new SyncDescriptor(UserDataSyncMachinesService, [], true),
    [IUserDataProfilesService.toString()]: new SyncDescriptor(BrowserUserDataProfilesService, [], true),
    [IUserDataSyncResourceProviderService.toString()]: new SyncDescriptor(UserDataSyncResourceProviderService, [], true),
    [IUserDataSyncLocalStoreService.toString()]: new SyncDescriptor(UserDataSyncLocalStoreService, [], true),
    [IUserDataSyncWorkbenchService.toString()]: new SyncDescriptor(UserDataSyncWorkbenchService, [], true),
    [IUserDataInitializationService.toString()]: new SyncDescriptor(InjectedUserDataInitializationService, [], true),
    [IUserDataSyncUtilService.toString()]: new SyncDescriptor(UserDataSyncUtilService, [], true),
    [IUserDataProfileImportExportService.toString()]: new SyncDescriptor(UserDataProfileImportExportService, [], true),
    [IUserDataProfileManagementService.toString()]: new SyncDescriptor(UserDataProfileManagementService, [], true)
  }
}
