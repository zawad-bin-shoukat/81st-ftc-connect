import 'package:flutter/material.dart';

class ProfilePhoto extends StatelessWidget {
  const ProfilePhoto({required this.url, this.size = 88, super.key});
  final String? url;
  final double size;

  @override
  Widget build(BuildContext context) {
    Widget fallback() => Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
      ),
      child: Icon(Icons.person_outline, size: size * 0.55),
    );
    if (url == null || url!.isEmpty) return fallback();
    return ClipOval(
      child: Image.network(
        url!,
        width: size,
        height: size,
        fit: BoxFit.cover,
        errorBuilder: (_, _, _) => fallback(),
      ),
    );
  }
}
