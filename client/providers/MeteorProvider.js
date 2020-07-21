import React from 'react';

import AuthorizationProvider from './AuthorizationProvider';
import { ConnectionStatusProvider } from './ConnectionStatusProvider';
import { RouterProvider } from './RouterProvider';
import SessionProvider from './SessionProvider';
import SettingsProvider from './SettingsProvider';
import { ServerProvider } from './ServerProvider';
import { SidebarProvider } from './SidebarProvider';
import { TranslationProvider } from './TranslationProvider';
import { ToastMessagesProvider } from './ToastMessagesProvider';
import UserProvider from './UserProvider';
import { AvatarUrlProvider } from './AvatarUrlProvider';
import { CustomSoundProvider } from './CustomSoundProvides';
import ModalProvider from './ModalProvider';
import SubscriptionProvider from './SubscriptionProvider';

export function MeteorProvider({ children }) {
	return <ConnectionStatusProvider>
		<ServerProvider>
			<RouterProvider>
				<TranslationProvider>
					<SessionProvider>
						<SidebarProvider>
							<ToastMessagesProvider>
								<SettingsProvider>
									<CustomSoundProvider>
										<AvatarUrlProvider>
											<SubscriptionProvider>
												<UserProvider>
													<AuthorizationProvider>
														<ModalProvider>
															{children}
														</ModalProvider>
													</AuthorizationProvider>
												</UserProvider>
											</SubscriptionProvider>
										</AvatarUrlProvider>
									</CustomSoundProvider>
								</SettingsProvider>
							</ToastMessagesProvider>
						</SidebarProvider>
					</SessionProvider>
				</TranslationProvider>
			</RouterProvider>
		</ServerProvider>
	</ConnectionStatusProvider>;
}

export default MeteorProvider;
