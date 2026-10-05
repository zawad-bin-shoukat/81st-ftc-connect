import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

class ApiException implements Exception {
  ApiException(this.message, [this.status]);
  final String message;
  final int? status;
  @override
  String toString() => message;
}

class ApiClient extends ChangeNotifier {
  ApiClient({http.Client? client, FlutterSecureStorage? storage})
    : _client = client ?? http.Client(),
      _storage = storage ?? const FlutterSecureStorage();

  final http.Client _client;
  final FlutterSecureStorage _storage;
  String? _token;
  bool restoring = true;
  String? startupError;
  VoidCallback? onSessionEnded;
  bool get signedIn => _token != null;
  bool get isTestAccount => _token?.startsWith('test_') ?? false;
  static String get baseUrl {
    const configured = String.fromEnvironment('API_BASE_URL');
    if (configured.isNotEmpty) return configured.replaceAll(RegExp(r'/$'), '');
    return !kIsWeb && defaultTargetPlatform == TargetPlatform.android
        ? 'http://10.0.2.2:3000'
        : 'http://127.0.0.1:3000';
  }

  Future<void> restore() async {
    restoring = true;
    startupError = null;
    notifyListeners();
    try {
      // Browser preview keeps credentials only in memory.
      if (!kIsWeb) _token = await _storage.read(key: 'ftc_session');
      if (_token != null) await request('GET', '/me');
    } catch (error) {
      if (error is! ApiException || error.status != 401) {
        startupError = error is ApiException
            ? error.message
            : 'Unable to open secure storage. Please retry.';
      }
    } finally {
      restoring = false;
      notifyListeners();
    }
  }

  Future<Map<String, dynamic>> request(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse(baseUrl + path);
    if (kReleaseMode && uri.scheme != 'https') {
      throw ApiException(
        'A secure server address is required for release builds.',
      );
    }
    final message = http.Request(method, uri);
    message.headers['Accept'] = 'application/json';
    if (_token != null) message.headers['Authorization'] = 'Bearer ${_token!}';
    if (body != null) {
      message.headers['Content-Type'] = 'application/json';
      message.body = jsonEncode(body);
    }
    http.Response response;
    try {
      response = await (() async {
        final streamed = await _client.send(message);
        return http.Response.fromStream(streamed);
      })().timeout(const Duration(seconds: 15));
    } on TimeoutException {
      throw ApiException('The server took too long. Please retry.');
    } on Exception {
      throw ApiException(
        'Cannot reach the server. Check your internet connection and retry.',
      );
    }
    Map<String, dynamic> data = {};
    try {
      if (response.body.isNotEmpty) {
        data = jsonDecode(response.body) as Map<String, dynamic>;
      }
    } catch (_) {
      throw ApiException('The server returned an unreadable response.');
    }
    if (response.statusCode == 401 && _token != null) await forgetSession();
    if (response.statusCode >= 400) {
      final message = data['message'];
      throw ApiException(
        message is String ? message : 'Request failed. Please retry.',
        response.statusCode,
      );
    }
    return data;
  }

  Future<void> uploadPhoto(Uint8List bytes) async {
    if (bytes.isEmpty || bytes.length > 8 * 1024 * 1024) {
      throw ApiException('Choose a photo smaller than 8 MB.');
    }
    final uri = Uri.parse('$baseUrl/me/photo');
    if (kReleaseMode && uri.scheme != 'https') {
      throw ApiException(
        'A secure server address is required for release builds.',
      );
    }
    final message = http.MultipartRequest('POST', uri);
    message.headers['Accept'] = 'application/json';
    if (_token != null) message.headers['Authorization'] = 'Bearer $_token';
    message.files.add(
      http.MultipartFile.fromBytes('photo', bytes, filename: 'profile.jpg'),
    );
    http.Response response;
    try {
      final sent = await _client
          .send(message)
          .timeout(const Duration(seconds: 60));
      response = await http.Response.fromStream(sent)
          .timeout(const Duration(seconds: 60));
    } on TimeoutException {
      throw ApiException('The photo upload took too long. Please retry.');
    } on Exception {
      throw ApiException(
        'Cannot upload the photo. Check your connection and retry.',
      );
    }
    if (response.statusCode == 401 && _token != null) await forgetSession();
    if (response.statusCode >= 400) {
      try {
        final data = jsonDecode(response.body) as Map<String, dynamic>;
        throw ApiException(
          data['message']?.toString() ?? 'Photo upload failed.',
          response.statusCode,
        );
      } on FormatException {
        throw ApiException(
          'Photo upload failed. Please retry.',
          response.statusCode,
        );
      }
    }
  }

  Future<void> acceptSession(String token) async {
    _token = token;
    try {
      if (!kIsWeb) await _storage.write(key: 'ftc_session', value: token);
    } catch (_) {
      try {
        await request('POST', '/auth/logout');
      } catch (_) {}
      _token = null;
      throw ApiException(
        'Could not securely save the login. Please try again.',
      );
    }
    startupError = null;
    notifyListeners();
  }

  Future<void> forgetSession() async {
    _token = null;
    startupError = null;
    if (!kIsWeb) {
      try {
        await _storage.delete(key: 'ftc_session');
      } catch (_) {
        startupError =
            'Could not clear secure storage. Please retry signing out.';
      }
    }
    onSessionEnded?.call();
    notifyListeners();
  }

  Future<void> logout() async {
    // If offline, retain the session until server-side revocation can complete.
    await request('POST', '/auth/logout');
    await forgetSession();
  }
}

class ApiScope extends InheritedWidget {
  const ApiScope({required this.api, required super.child, super.key});
  final ApiClient api;
  static ApiClient of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ApiScope>()!.api;
  @override
  bool updateShouldNotify(ApiScope oldWidget) => api != oldWidget.api;
}
