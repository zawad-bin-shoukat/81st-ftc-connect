import 'package:flutter/material.dart';

import 'screens/welcome_screen.dart';
import 'screens/live_shell.dart';
import 'api_client.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const FtcConnectApp());
}

class FtcConnectApp extends StatefulWidget {
  const FtcConnectApp({this.api, super.key});
  final ApiClient? api;
  @override
  State<FtcConnectApp> createState() => _FtcConnectAppState();
}

class _FtcConnectAppState extends State<FtcConnectApp> {
  late final _api = widget.api ?? ApiClient();
  final _navigator = GlobalKey<NavigatorState>();
  @override
  void initState() {
    super.initState();
    _api.onSessionEnded = () =>
        _navigator.currentState?.popUntil((route) => route.isFirst);
    _api.restore();
  }

  @override
  Widget build(BuildContext context) {
    return ApiScope(
      api: _api,
      child: MaterialApp(
        navigatorKey: _navigator,
        title: '81st FTC Connect',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF00695C)),
          useMaterial3: true,
          scaffoldBackgroundColor: const Color(0xFFF6FAF8),
          inputDecorationTheme: const InputDecorationTheme(
            border: OutlineInputBorder(),
          ),
        ),
        home: AnimatedBuilder(
          animation: _api,
          builder: (context, _) {
            if (_api.restoring) {
              return const Scaffold(
                body: Center(child: CircularProgressIndicator()),
              );
            }
            if (_api.startupError != null) {
              return Scaffold(
                body: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(_api.startupError!, textAlign: TextAlign.center),
                        TextButton(
                          onPressed: _api.restore,
                          child: const Text('Retry'),
                        ),
                        TextButton(
                          onPressed: _api.forgetSession,
                          child: const Text('Clear local login'),
                        ),
                      ],
                    ),
                  ),
                ),
              );
            }
            return _api.signedIn ? LiveShell(api: _api) : const WelcomeScreen();
          },
        ),
      ),
    );
  }
}
