import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:ftc_connect/main.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

void main() {
  setUp(() => FlutterSecureStorage.setMockInitialValues({}));

  testWidgets('review credentials open only the fictional editable demo', (
    tester,
  ) async {
    await tester.pumpWidget(const FtcConnectApp());
    await tester.pumpAndSettle();

    await tester.tap(find.text('Reviewer demo'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField).at(0), 'ftc-reviewer');
    await tester.enterText(find.byType(TextFormField).at(1), 'incorrect');
    await tester.tap(find.text('Open demo'));
    await tester.pump();
    expect(find.text('Check the reviewer username and password.'), findsOneWidget);

    await tester.enterText(find.byType(TextFormField).at(1), 'FTC-Review-2026');
    await tester.tap(find.text('Open demo'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Reviewer demo · fictional profiles'), findsOneWidget);
    expect(find.text('Example Member A'), findsOneWidget);

    await tester.tap(find.text('My profile'));
    await tester.pumpAndSettle();
    expect(find.text('Edit preview profile'), findsOneWidget);
    expect(find.text('Delete demo profile'), findsOneWidget);
  });
}
