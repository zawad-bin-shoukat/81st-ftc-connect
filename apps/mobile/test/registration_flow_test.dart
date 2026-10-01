import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:ftc_connect/api_client.dart';
import 'package:ftc_connect/main.dart';

void main() {
  testWidgets('new member request waits for approval and does not sign in', (
    tester,
  ) async {
    FlutterSecureStorage.setMockInitialValues({});
    final requests = <http.Request>[];
    final api = ApiClient(
      client: MockClient((r) async {
        requests.add(r);
        return http.Response(
          jsonEncode({'message': 'Administrator approval required.'}),
          202,
        );
      }),
    );
    await tester.pumpWidget(FtcConnectApp(api: api));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in with phone'));
    await tester.pumpAndSettle();
    expect(find.text('Private invite code'), findsNothing);
    await tester.ensureVisible(
      find.text('Not in the roster? Request membership'),
    );
    await tester.tap(find.text('Not in the roster? Request membership'));
    await tester.pumpAndSettle();
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Synthetic applicant');
    await tester.enterText(fields.at(1), '9998');
    await tester.enterText(fields.at(2), '+12025550100');
    await tester.enterText(
      fields.at(3),
      'Section A; administrator can verify membership.',
    );
    FocusManager.instance.primaryFocus?.unfocus();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Submit for review'));
    await tester.tap(find.text('Submit for review'));
    await tester.pumpAndSettle();
    expect(find.text('Administrator approval required.'), findsOneWidget);
    expect(requests.single.url.path, '/auth/registration');
    expect(jsonDecode(requests.single.body)['ftcId'], 9998);
    expect(api.signedIn, isFalse);
  });
}
