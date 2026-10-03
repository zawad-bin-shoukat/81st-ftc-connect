import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ftc_connect/api_client.dart';
import 'package:ftc_connect/screens/delete_account_screen.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('deletion requires typed confirmation and clears local login', (
    tester,
  ) async {
    final requests = <http.Request>[];
    final api = ApiClient(
      client: MockClient((request) async {
        requests.add(request);
        return http.Response(
          '{"message":"Your account and app profile have been deleted."}',
          200,
          headers: {'content-type': 'application/json'},
        );
      }),
    );
    await api.acceptSession('synthetic-token');
    await tester.pumpWidget(
      MaterialApp(home: DeleteAccountScreen(api: api, isTestAccount: false)),
    );
    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
    await tester.enterText(find.byType(TextField), 'DELETE');
    await tester.pump();
    await tester.tap(find.text('Delete my account'));
    await tester.pumpAndSettle();
    expect(requests, hasLength(1));
    expect(requests.single.method, 'DELETE');
    expect(requests.single.url.path, '/me');
    expect(jsonDecode(requests.single.body), {'confirm': 'DELETE'});
    expect(api.signedIn, false);
  });
}
