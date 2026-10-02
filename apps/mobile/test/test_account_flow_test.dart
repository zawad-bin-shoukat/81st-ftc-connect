import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ftc_connect/api_client.dart';
import 'package:ftc_connect/screens/test_sign_in_screen.dart';
import 'package:ftc_connect/screens/live_profile_screen.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  testWidgets(
    'test login and resend stay separate from participant authentication',
    (tester) async {
      final requests = <http.Request>[];
      final api = ApiClient(
        client: MockClient((r) async {
          requests.add(r);
          if (r.url.path.endsWith('/verify')) {
            return http.Response('{"token":"test_synthetic"}', 200);
          }
          if (r.url.path.endsWith('/logout')) return http.Response('', 204);
          return http.Response(
            '{"challengeId":"test-challenge","deliveryMode":"sms"}',
            200,
          );
        }),
      );
      await tester.pumpWidget(
        ApiScope(
          api: api,
          child: const MaterialApp(home: TestSignInScreen()),
        ),
      );
      await tester.tap(find.text('Continue'));
      await tester.pump();
      expect(find.text('Enter your login phone number'), findsOneWidget);
      expect(requests, isEmpty);
      await tester.enterText(find.byType(TextFormField).last, '01712345678');
      await tester.tap(find.text('Continue'));
      await tester.pumpAndSettle();
      expect(requests.single.url.path, '/auth/test/login');
      expect(jsonDecode(requests.single.body)['testId'], 1000);
      await tester.pump(const Duration(seconds: 61));
      await tester.tap(find.text('Request another code'));
      await tester.pumpAndSettle();
      expect(requests.last.url.path, '/auth/test/login');
      await tester.enterText(find.byType(TextField), '123456');
      await tester.tap(find.text('Verify and continue'));
      await tester.pumpAndSettle();
      expect(requests.last.url.path, '/auth/test/verify');
      expect(api.isTestAccount, true);
      await api.logout();
      expect(requests.last.url.path, '/auth/logout');
      expect(api.signedIn, false);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets(
    'separate own profile shows test identity and administrator actions',
    (tester) async {
      final api = ApiClient(
        client: MockClient(
          (r) async => http.Response(
            jsonEncode({
              'id': 'test-account',
              'ftcId': 1000,
              'testId': 1000,
              'isTestAccount': true,
              'isAdministrator': true,
              'name': 'Test administrator',
              'section': 'T',
              'cadre': {'name': 'Test profile'},
              'bcsBatch': null,
              'education': 'Test',
              'university': 'Test',
              'phone': 'Test contact',
              'email': 'test@example.invalid',
              'bloodGroup': 'Unknown',
              'homeDistrict': 'Test district',
              'loginPhone': '+8801712345678',
            }),
            200,
          ),
        ),
      );
      await tester.pumpWidget(MaterialApp(home: LiveProfileScreen(api: api)));
      await tester.pumpAndSettle();
      expect(
        find.textContaining('You are not signed in as a real participant.'),
        findsOneWidget,
      );
      expect(find.text('Review membership requests'), findsOneWidget);
      expect(find.text('Test ID'), findsOneWidget);
    },
  );
}
