/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the Source EULA. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ControllerInfo, ResourceType } from 'arc';
import 'mocha';
import * as should from 'should';
import * as TypeMoq from 'typemoq';
import * as sinon from 'sinon';
import { v4 as uuid } from 'uuid';
import * as vscode from 'vscode';
import * as azdataExt from 'azdata-ext';
import { ControllerModel } from '../../../models/controllerModel';
import { MiaaModel } from '../../../models/miaaModel';
import { AzureArcTreeDataProvider } from '../../../ui/tree/azureArcTreeDataProvider';
import { ControllerTreeNode } from '../../../ui/tree/controllerTreeNode';
import { MiaaTreeNode } from '../../../ui/tree/miaaTreeNode';
import { FakeControllerModel } from '../../mocks/fakeControllerModel';
import { FakeAzdataApi } from '../../mocks/fakeAzdataApi';

interface ExtensionGlobalMemento extends vscode.Memento {
	setKeysForSync(keys: string[]): void;
}

describe('AzureArcTreeDataProvider tests', function (): void {
	let treeDataProvider: AzureArcTreeDataProvider;
	beforeEach(function (): void {
		const mockExtensionContext = TypeMoq.Mock.ofType<vscode.ExtensionContext>();
		const mockGlobalState = TypeMoq.Mock.ofType<ExtensionGlobalMemento>();
		mockGlobalState.setup(x => x.update(TypeMoq.It.isAny(), TypeMoq.It.isAny())).returns(() => Promise.resolve());
		mockExtensionContext.setup(x => x.globalState).returns(() => mockGlobalState.object);
		//treeDataProviderMock = TypeMoq.Mock.ofType<AzureArcTreeDataProvider>();
		treeDataProvider = new AzureArcTreeDataProvider(mockExtensionContext.object);
	});

	describe('addOrUpdateController', function (): void {
		it('Multiple Controllers are added correctly', async function (): Promise<void> {
			treeDataProvider['_loading'] = false;
			let children = await treeDataProvider.getChildren();
			should(children.length).equal(0, 'There initially shouldn\'t be any children');
			const controllerModel = new FakeControllerModel();
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			children = await treeDataProvider.getChildren();
			should(children.length).equal(1, 'Controller node should be added correctly');

			// Add a couple more
			const controllerModel2 = new FakeControllerModel();
			const controllerModel3 = new FakeControllerModel();
			await treeDataProvider.addOrUpdateController(controllerModel2, '');
			await treeDataProvider.addOrUpdateController(controllerModel3, '');
			children = await treeDataProvider.getChildren();
			should(children.length).equal(3, 'Additional Controller nodes should be added correctly');
		});

		it('Adding a Controller more than once doesn\'t create duplicates', async function (): Promise<void> {
			treeDataProvider['_loading'] = false;
			let children = await treeDataProvider.getChildren();
			should(children.length).equal(0, 'There initially shouldn\'t be any children');
			const controllerModel = new ControllerModel(treeDataProvider, { id: uuid(), url: '127.0.0.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'my-arc', username: 'sa', rememberPassword: true, resources: [] });
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			should(children.length).equal(1, 'Controller node should be added correctly');
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			should(children.length).equal(1, 'Shouldn\'t add duplicate controller node');
		});

		it('Updating an existing controller works as expected', async function (): Promise<void> {
			treeDataProvider['_loading'] = false;
			let children = await treeDataProvider.getChildren();
			should(children.length).equal(0, 'There initially shouldn\'t be any children');
			const originalInfo: ControllerInfo = { id: uuid(), url: '127.0.0.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'my-arc', username: 'sa', rememberPassword: true, resources: [] };
			const controllerModel = new ControllerModel(treeDataProvider, originalInfo);
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			should(children.length).equal(1, 'Controller node should be added correctly');
			should((<ControllerTreeNode>children[0]).model.info).deepEqual(originalInfo);
			const newInfo = { id: originalInfo.id, url: '1.1.1.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'new-name', username: 'admin', rememberPassword: false, resources: [] };
			const controllerModel2 = new ControllerModel(treeDataProvider, newInfo);
			await treeDataProvider.addOrUpdateController(controllerModel2, '');
			should(children.length).equal(1, 'Shouldn\'t add duplicate controller node');
			should((<ControllerTreeNode>children[0]).model.info).deepEqual(newInfo);
		});
	});

	describe('getChildren', function (): void {
		it('should return an empty array before loading stored controllers is completed', async function (): Promise<void> {
			treeDataProvider['_loading'] = true;
			let children = await treeDataProvider.getChildren();
			should(children.length).equal(0, 'While loading we should return an empty array');
		});

		it('should return no children after loading', async function (): Promise<void> {
			treeDataProvider['_loading'] = false;
			let children = await treeDataProvider.getChildren();
			should(children.length).equal(0, 'After loading we should have 0 children');
		});

		it('should return all children of controller after loading', async function (): Promise<void> {
			const mockArcExtension = TypeMoq.Mock.ofType<vscode.Extension<any>>();
			const mockArcApi = TypeMoq.Mock.ofType<azdataExt.IExtension>();
			mockArcExtension.setup(x => x.exports).returns(() => {
				return mockArcApi.object;
			});
			const fakeAzdataApi = new FakeAzdataApi();
			fakeAzdataApi.postgresInstances = [{ name: 'pg1', state: '', workers: 0 }];
			fakeAzdataApi.miaaInstances = [{ name: 'miaa1', state: '', replicas: '', serverEndpoint: '' }];
			mockArcApi.setup(x => x.azdata).returns(() => fakeAzdataApi);

			sinon.stub(vscode.extensions, 'getExtension').returns(mockArcExtension.object);
			const controllerModel = new ControllerModel(treeDataProvider, { id: uuid(), url: '127.0.0.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'my-arc', username: 'sa', rememberPassword: true, resources: [] }, 'mypassword');
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			const controllerNode = treeDataProvider.getControllerNode(controllerModel);
			const children = await treeDataProvider.getChildren(controllerNode);
			should(children.filter(c => c.label === fakeAzdataApi.postgresInstances[0].name).length).equal(1, 'Should have a Postgres child');
			should(children.filter(c => c.label === fakeAzdataApi.miaaInstances[0].name).length).equal(1, 'Should have a MIAA child');
			should(children.length).equal(2, 'Should have excatly 2 children');
		});
	});

	describe('removeController', function (): void {
		it('removing a controller should work as expected', async function (): Promise<void> {
			treeDataProvider['_loading'] = false;
			const controllerModel = new ControllerModel(treeDataProvider, { id: uuid(), url: '127.0.0.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'my-arc', username: 'sa', rememberPassword: true, resources: [] });
			const controllerModel2 = new ControllerModel(treeDataProvider, { id: uuid(), url: '127.0.0.2', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'my-arc', username: 'cloudsa', rememberPassword: true, resources: [] });
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			await treeDataProvider.addOrUpdateController(controllerModel2, '');
			const children = <ControllerTreeNode[]>(await treeDataProvider.getChildren());
			await treeDataProvider.removeController(children[0]);
			should((await treeDataProvider.getChildren()).length).equal(1, 'Node should have been removed');
			await treeDataProvider.removeController(children[0]);
			should((await treeDataProvider.getChildren()).length).equal(1, 'Removing same node again should do nothing');
			await treeDataProvider.removeController(children[1]);
			should((await treeDataProvider.getChildren()).length).equal(0, 'Removing other node should work');
			await treeDataProvider.removeController(children[1]);
			should((await treeDataProvider.getChildren()).length).equal(0, 'Removing other node again should do nothing');
		});
	});

	describe('openResourceDashboard', function (): void {
		it('Opening dashboard for nonexistent controller node throws', async function (): Promise<void> {
			const controllerModel = new ControllerModel(treeDataProvider, { id: uuid(), url: '127.0.0.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster',  name: 'my-arc', username: 'sa', rememberPassword: true, resources: [] });
			const openDashboardPromise = treeDataProvider.openResourceDashboard(controllerModel, ResourceType.sqlManagedInstances, '');
			await should(openDashboardPromise).be.rejected();
		});

		it('Opening dashboard for nonexistent resource throws', async function (): Promise<void> {
			const controllerModel = new ControllerModel(treeDataProvider, { id: uuid(), url: '127.0.0.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'my-arc', username: 'sa', rememberPassword: true, resources: [] });
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			const openDashboardPromise = treeDataProvider.openResourceDashboard(controllerModel, ResourceType.sqlManagedInstances, '');
			await should(openDashboardPromise).be.rejected();
		});

		it('Opening dashboard for existing resource node succeeds', async function (): Promise<void> {
			const controllerModel = new ControllerModel(treeDataProvider, { id: uuid(), url: '127.0.0.1', kubeConfigFilePath: '/path/to/.kube/config', kubeClusterContext: 'currentCluster', name: 'my-arc', username: 'sa', rememberPassword: true, resources: [] });
			const miaaModel = new MiaaModel(controllerModel, { name: 'miaa-1', resourceType: ResourceType.sqlManagedInstances }, undefined!, treeDataProvider);
			await treeDataProvider.addOrUpdateController(controllerModel, '');
			const controllerNode = treeDataProvider.getControllerNode(controllerModel)!;
			const resourceNode = new MiaaTreeNode(miaaModel, controllerModel);
			sinon.stub(controllerNode, 'getResourceNode').returns(resourceNode);
			const showDashboardStub = sinon.stub(resourceNode, 'openDashboard');
			await treeDataProvider.openResourceDashboard(controllerModel, ResourceType.sqlManagedInstances, '');
			should(showDashboardStub.calledOnce).be.true('showDashboard should have been called exactly once');
		});
	});
});
