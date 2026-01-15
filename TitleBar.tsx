import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import colours from "./colours";

export default function Titlebar() {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.mainTitle}>VeloMetry</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colours.MainBackground,
  },
  container: {
    height: 44,
    backgroundColor: colours.MainBackground,
    alignItems: "center",
    justifyContent: "center",
    borderBottomColor: "#E5E5EA",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  mainTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: colours.PrimaryText,
  },
});
