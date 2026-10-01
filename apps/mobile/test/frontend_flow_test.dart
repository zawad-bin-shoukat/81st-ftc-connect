import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ftc_connect/main.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));
  testWidgets('preview directory can filter and open a fictional profile', (
    tester,
  ) async {
    await tester.pumpWidget(const FtcConnectApp());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Explore interface preview'));
    await tester.pumpAndSettle();

    expect(find.text('Example Member A'), findsOneWidget);
    expect(find.text('Example Member B'), findsOneWidget);

    await tester.enterText(find.byType(TextField).first, 'Police');
    await tester.pump();
    expect(find.text('Example Member A'), findsNothing);
    expect(find.text('Example Member B'), findsOneWidget);

    await tester.tap(find.text('Example Member B'));
    await tester.pumpAndSettle();
    expect(find.text('Member profile'), findsOneWidget);
    expect(find.text('Unknown'), findsOneWidget);
  });

  testWidgets('phone input is required and local testing is explicit', (
    tester,
  ) async {
    await tester.pumpWidget(const FtcConnectApp());
    await tester.pumpAndSettle();
    await tester.tap(find.text('Sign in with phone'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Continue'));
    await tester.pump();
    expect(find.text('Enter your login phone number'), findsOneWidget);
    expect(find.textContaining('No SMS is sent'), findsOneWidget);
  });
}
