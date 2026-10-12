package com.lbc_plot;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import org.junit.jupiter.api.Test;

import com.lbc_plot.common.util.io.WebpSelfCheck;

/**
 * 安装包自检入口的参数解析。
 *
 * <p>自检本身（{@code --self-check=webp}）要验证的是"打包后的 jar 能不能解 WebP"，
 * 只能在打好的 jar 上跑，见 {@link WebpSelfCheck}；这里只锁住"哪些参数会触发自检"，
 * 避免将来加参数时把正常启动误判成自检（那会让程序启动后立刻退出）。
 */
class MainApplicationTest {

    @Test
    void equalsFormIsRecognized() {
        assertEquals("webp", MainApplication.selfCheckTarget(new String[] {"--self-check=webp"}));
    }

    @Test
    void spaceFormIsRecognized() {
        assertEquals("webp", MainApplication.selfCheckTarget(new String[] {"--self-check", "webp"}));
    }

    @Test
    void normalStartupArgumentsDoNotTriggerSelfCheck() {
        assertNull(MainApplication.selfCheckTarget(new String[] {}));
        assertNull(MainApplication.selfCheckTarget(null));
        assertNull(MainApplication.selfCheckTarget(new String[] {"--server.port=8081"}));
        assertNull(MainApplication.selfCheckTarget(new String[] {"--self-check="}));
        assertNull(MainApplication.selfCheckTarget(new String[] {"--self-check"}), "缺少目标值时不应触发自检");
    }

    @Test
    void unsupportedTargetFailsLoudlyInsteadOfStartingSpring() {
        // 目标不认识时返回 2，而不是悄悄启动 Spring（否则脚本会以为自检通过了）
        assertEquals(2, WebpSelfCheck.run("png"));
    }
}
