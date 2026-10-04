import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ftc_connect/api_client.dart';
import 'package:ftc_connect/main.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  testWidgets('successful login loads API data and logout removes it', (
    tester,
  ) async {
    final person = {
      'id': 'member-1',
      'ftcId': 9999,
      'name': 'Synthetic API member',
      'section': 'A',
      'cadre': {'id': 'cadre-1', 'name': 'Test cadre'},
      'bcsBatch': null,
      'homeDistrict': 'Dhaka',
      'education': 'Degree',
      'university': 'University',
      'phone': 'Raw contact',
      'email': 'test@example.com',
      'bloodGroup': 'A',
      'aboutMe': null,
      'favouriteQuotation': null,
      'loginPhone': '+12025550100',
    };
    final requests = <http.Request>[];
    final client = MockClient((request) async {
      requests.add(request);
      dynamic data;
      switch (request.url.path) {
        case '/auth/login':
          data = {'challengeId': 'test-challenge', 'deliveryMode': 'local'};
        case '/auth/verify':
          data = {'token': 'test-token'};
        case '/members':
          data = {
            'items': [person],
            'total': 1,
            'totalPages': 1,
          };
        case '/members/filters':
          data = {
            'sections': ['A'],
            'cadres': [],
            'bcsBatches': [null],
            'bloodGroups': ['A'],
            'homeDistricts': ['Dhaka'],
          };
        case '/me':
          data = person;
        case '/auth/logout':
          return http.Response('', 204);
        default:
          return http.Response('{"message":"Unexpected route"}', 404);
      }
      return http.Response(jsonEncode(data), 200);
    });
    final api = ApiClient(client: client);
    await tester.pumpWidget(FtcConnectApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in with phone'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '+12025550100');
    await tester.tap(find.text('Continue'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Local test — no SMS'), findsOneWidget);
    await tester.enterText(find.byType(TextField).first, '123456');
    await tester.tap(find.text('Verify and continue'));
    await tester.pumpAndSettle();
    expect(
      find.text('Synthetic API member'),
      findsOneWidget,
      reason: find
          .byType(Text)
          .evaluate()
          .map((element) => (element.widget as Text).data)
          .join(' | '),
    );
    expect(find.text('Example Member A'), findsNothing);
    expect(
      requests
          .singleWhere((r) => r.url.path == '/members')
          .headers['authorization'],
      'Bearer test-token',
    );
    await tester.tap(find.byTooltip('Filter members'));
    await tester.pumpAndSettle();
    final districtFilter = find.byWidgetPredicate(
      (widget) =>
          widget is DropdownButtonFormField<String> &&
          widget.decoration.labelText == 'Home district',
    );
    await tester.ensureVisible(districtFilter);
    await tester.pumpAndSettle();
    await tester.tap(districtFilter);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Dhaka').last);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Apply'));
    await tester.pumpAndSettle();
    expect(
      requests
          .lastWhere((r) => r.url.path == '/members')
          .url
          .queryParameters['homeDistrict'],
      'Dhaka',
    );
    await tester.tap(find.text('My profile'));
    await tester.pumpAndSettle();
    expect(find.text('Synthetic API member'), findsOneWidget);
    expect(requests.any((r) => r.url.path == '/me'), isTrue);
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Sign in with phone'), findsOneWidget);
    expect(
      requests
          .singleWhere((r) => r.url.path == '/auth/logout')
          .headers['authorization'],
      'Bearer test-token',
    );
    expect(api.signedIn, isFalse);
    expect(await const FlutterSecureStorage().read(key: 'ftc_session'), isNull);
    expect(find.text('Synthetic API member'), findsNothing);
  });

  test('expired sessions are cleared; network failures are not replaced by dummy data', () async {
    final api = ApiClient(
      client: MockClient(
        (_) async => http.Response('{"message":"Expired"}', 401),
      ),
    );
    await api.acceptSession('token');
    await expectLater(
      api.request('GET', '/members'),
      throwsA(isA<ApiException>()),
    );
    expect(api.signedIn, false);
    final offline = ApiClient(
      client: MockClient((_) async => throw http.ClientException('offline')),
    );
    await expectLater(
      offline.request('GET', '/members'),
      throwsA(isA<ApiException>()),
    );
  });
}
